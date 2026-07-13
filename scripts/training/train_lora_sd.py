"""
CatVTON SD 1.5 LoRA Fine-Tuning for Indian Ethnic Wear
=========================================================
LoRA fine-tunes the SD 1.5 inpainting UNet — the model that the deployed
RunPod CatVTON handler actually runs (not FLUX). Use this when you want to
improve try-on quality for Indian ethnic wear.

Key differences from train_lora.py (FLUX-based):
- Targets UNet2DConditionModel (SD 1.5) instead of FluxTransformer2DModel
- Uses DDIMScheduler instead of FlowMatchEulerDiscreteScheduler
- 512x384 images instead of 768x576 → 12GB VRAM instead of 24GB
- Output LoRA weights can be loaded via CATVTON_LORA_PATH on the RunPod handler

Requirements:
    - GPU with 12GB+ VRAM (RTX 3060/4060, RTX 3090, A10G, L4)
    - Prepared dataset (run scripts/dataset/prepare_dataset.py first with --format flux-lora)
    - ~2-4 hours for 2000 steps on RTX 3090

Usage:
    # Basic training
    accelerate launch scripts/training/train_lora_sd.py \\
        --dataset-path ./training-data \\
        --output-dir ./outputs/sd-ethnic-lora

    # With custom LoRA rank and fewer steps for faster iteration
    accelerate launch scripts/training/train_lora_sd.py \\
        --dataset-path ./training-data \\
        --output-dir ./outputs/sd-ethnic-lora \\
        --lora-rank 16 \\
        --max-train-steps 1500

    # Checkpoint -> deploy to RunPod:
    #   1. Upload ./outputs/sd-ethnic-lora/lora-final/ to HuggingFace or R2
    #   2. Set CATVTON_LORA_PATH on the RunPod endpoint env vars
"""

import argparse
import json
import os
import sys
from pathlib import Path

import torch
import torch.nn.functional as F
from accelerate import Accelerator
from accelerate.logging import get_logger
from accelerate.utils import set_seed
from diffusers import UNet2DConditionModel, AutoencoderKL, DDIMScheduler
from diffusers.optimization import get_scheduler
from diffusers.utils import check_min_version
from PIL import Image
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from tqdm import tqdm
from transformers import CLIPTokenizer, CLIPTextModel

check_min_version("0.27.0")

logger = get_logger(__name__)


# ─── Constants ─────────────────────────────────────────────────

SD_INPAINT_BASE = "stable-diffusion-v1-5/stable-diffusion-inpainting"

# Training defaults
DEFAULT_LORA_RANK = 32
DEFAULT_LORA_ALPHA = 16
DEFAULT_LEARNING_RATE = 1e-4
DEFAULT_TRAIN_STEPS = 3000
DEFAULT_BATCH_SIZE = 1
DEFAULT_GRAD_ACCUMULATION = 4
DEFAULT_HEIGHT = 512
DEFAULT_WIDTH = 384
DEFAULT_NOISE_OFFSET = 0.05  # small noise offset for better detail


# ─── Dataset ──────────────────────────────────────────────────

class EthnicWearDataset(Dataset):
    """
    Dataset for SD-based CatVTON LoRA training.

    Expects the flux-lora format from prepare_dataset.py:
        dataset/
        ├── kanchuki_00001.jpg       # Garment images
        ├── kanchuki_00001_mask.png  # Segmentation masks (optional)
        ├── captions/
        │   └── kanchuki_00001.txt   # Caption
        └── dataset.json             # Manifest
    """

    def __init__(self, dataset_path: str, height: int = DEFAULT_HEIGHT,
                 width: int = DEFAULT_WIDTH, validation_split: float = 0.0,
                 is_validation: bool = False):
        self.dataset_path = Path(dataset_path)
        self.height = height
        self.width = width

        manifest_path = self.dataset_path / "dataset.json"
        if not manifest_path.exists():
            raise FileNotFoundError(f"dataset.json not found at {manifest_path}")

        with open(manifest_path) as f:
            self.manifest = json.load(f)

        all_entries = self.manifest["entries"]
        if validation_split > 0:
            split_idx = int(len(all_entries) * (1 - validation_split))
            self.entries = all_entries[split_idx:] if is_validation else all_entries[:split_idx]
            logger.info(f"Dataset: {len(all_entries)} total → "
                       f"{len(all_entries[:split_idx])} train / {len(all_entries[split_idx:])} val")
        else:
            self.entries = all_entries

        logger.info(f"Loaded {len(self.entries)} images from {dataset_path}")

        # Augmentation: mild color jitter + horizontal flip helps generalization
        self.train_transform = transforms.Compose([
            transforms.Resize((height, width), interpolation=transforms.InterpolationMode.BILINEAR),
            transforms.RandomHorizontalFlip(p=0.3),
            transforms.ColorJitter(brightness=0.05, contrast=0.05, saturation=0.05, hue=0.02),
            transforms.ToTensor(),
            transforms.Normalize([0.5], [0.5]),
        ])

        self.val_transform = transforms.Compose([
            transforms.Resize((height, width), interpolation=transforms.InterpolationMode.BILINEAR),
            transforms.ToTensor(),
            transforms.Normalize([0.5], [0.5]),
        ])

        self.mask_transform = transforms.Compose([
            transforms.Resize((height, width), interpolation=transforms.InterpolationMode.NEAREST),
            transforms.ToTensor(),
        ])
        self.is_validation = is_validation

    def __len__(self):
        return len(self.entries)

    def __getitem__(self, idx):
        entry = self.entries[idx]
        img_path = self.dataset_path / entry["image"]
        image = Image.open(img_path).convert("RGB")

        image_tensor = self.val_transform(image) if self.is_validation else self.train_transform(image)

        # Load or create mask (white = garment area)
        img_stem = Path(entry["image"]).stem
        mask_path = self.dataset_path / f"{img_stem}_mask.png"
        if entry.get("has_mask") and mask_path.exists():
            mask_img = Image.open(mask_path).convert("L")
        else:
            # Full white mask: garment fills the frame in product photos
            mask_img = Image.new("L", (self.width, self.height), 255)

        mask_tensor = self.mask_transform(mask_img)

        caption = entry.get("caption", "An Indian ethnic wear garment")

        return {
            "pixel_values": image_tensor,
            "mask_values": mask_tensor,
            "caption": caption,
        }


# ─── Model Loading ────────────────────────────────────────────

def load_models(accelerator: Accelerator, use_lora: bool = True,
                lora_rank: int = DEFAULT_LORA_RANK):
    """Load SD 1.5 inpainting models with optional LoRA."""
    logger.info(f"Loading SD 1.5 inpainting model ({SD_INPAINT_BASE})...")
    weight_dtype = torch.bfloat16 if accelerator.mixed_precision == "bf16" else torch.float32

    # Load UNet
    unet = UNet2DConditionModel.from_pretrained(
        SD_INPAINT_BASE,
        subfolder="unet",
        torch_dtype=weight_dtype,
    )

    # Apply LoRA to attention layers
    if use_lora:
        from peft import LoraConfig, get_peft_model

        lora_config = LoraConfig(
            r=lora_rank,
            lora_alpha=lora_rank // 2,
            target_modules=["to_q", "to_k", "to_v", "to_out.0"],
            lora_dropout=0.05,
            bias="none",
        )
        unet = get_peft_model(unet, lora_config)
        unet.print_trainable_parameters()

    # Load VAE
    vae = AutoencoderKL.from_pretrained(
        SD_INPAINT_BASE,
        subfolder="vae",
        torch_dtype=weight_dtype,
    )

    # Load text encoder + tokenizer
    text_encoder = CLIPTextModel.from_pretrained(
        SD_INPAINT_BASE,
        subfolder="text_encoder",
        torch_dtype=weight_dtype,
    )
    tokenizer = CLIPTokenizer.from_pretrained(
        SD_INPAINT_BASE,
        subfolder="tokenizer",
    )

    # Load noise scheduler
    noise_scheduler = DDIMScheduler.from_pretrained(
        SD_INPAINT_BASE,
        subfolder="scheduler",
    )

    return unet, vae, text_encoder, tokenizer, noise_scheduler


# ─── Training ─────────────────────────────────────────────────

def train(args):
    accelerator = Accelerator(
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        mixed_precision=args.mixed_precision,
        log_with="tensorboard" if args.tracking else None,
        project_dir=args.output_dir,
    )
    set_seed(args.seed)

    # Datasets
    train_dataset = EthnicWearDataset(
        dataset_path=args.dataset_path,
        height=args.height, width=args.width,
        validation_split=args.validation_split, is_validation=False,
    )
    train_loader = DataLoader(
        train_dataset, batch_size=args.train_batch_size,
        shuffle=True, num_workers=args.num_workers,
    )

    val_loader = None
    if args.validation_split > 0:
        val_dataset = EthnicWearDataset(
            dataset_path=args.dataset_path,
            height=args.height, width=args.width,
            validation_split=args.validation_split, is_validation=True,
        )
        val_loader = DataLoader(
            val_dataset, batch_size=args.train_batch_size,
            shuffle=False, num_workers=args.num_workers,
        )

    # Models
    unet, vae, text_encoder, tokenizer, noise_scheduler = load_models(
        accelerator, use_lora=args.use_lora, lora_rank=args.lora_rank,
    )
    vae.requires_grad_(False)
    text_encoder.requires_grad_(False)

    # Optimizer
    if args.use_8bit_adam:
        try:
            import bitsandbytes as bnb
            opt_cls = bnb.optim.AdamW8bit
        except ImportError:
            logger.warning("bitsandbytes not installed, using AdamW")
            opt_cls = torch.optim.AdamW
    else:
        opt_cls = torch.optim.AdamW

    optimizer = opt_cls(
        unet.parameters(),
        lr=args.learning_rate,
        betas=(0.9, 0.999), weight_decay=1e-2, eps=1e-8,
    )

    lr_scheduler = get_scheduler(
        args.lr_scheduler, optimizer=optimizer,
        num_warmup_steps=args.lr_warmup_steps,
        num_training_steps=args.max_train_steps * args.gradient_accumulation_steps,
    )

    unet, optimizer, train_loader, lr_scheduler = accelerator.prepare(
        unet, optimizer, train_loader, lr_scheduler,
    )
    vae = vae.to(accelerator.device)
    text_encoder = text_encoder.to(accelerator.device)

    if args.tracking:
        accelerator.init_trackers("catvton-sd-ethnic-wear", config=vars(args))

    # Training loop
    global_step = 0
    first_epoch = 0

    if args.resume_from:
        accelerator.load_state(args.resume_from)
        if "checkpoint" in args.resume_from:
            global_step = int(args.resume_from.split("-")[-1])
            first_epoch = global_step // len(train_loader)

    progress_bar = tqdm(
        range(global_step, args.max_train_steps), desc="Steps",
        disable=not accelerator.is_local_main_process, initial=global_step,
    )
    unet.train()

    for epoch in range(first_epoch, args.num_train_epochs):
        for step, batch in enumerate(train_loader):
            with accelerator.accumulate(unet):
                pixel_values = batch["pixel_values"].to(accelerator.device, dtype=torch.bfloat16)
                mask_values = batch["mask_values"].to(accelerator.device, dtype=torch.bfloat16)
                captions = batch["caption"]

                # Encode to latents
                with torch.no_grad():
                    latents = vae.encode(pixel_values).latent_dist.sample()
                    latents = latents * vae.config.scaling_factor

                # Sample noise
                noise = torch.randn_like(latents)
                if args.noise_offset > 0:
                    noise = noise + args.noise_offset * torch.randn(
                        latents.shape[0], latents.shape[1], 1, 1,
                        device=latents.device,
                    )

                bsz = latents.shape[0]
                timesteps = torch.randint(
                    0, noise_scheduler.config.num_train_timesteps,
                    (bsz,), device=latents.device,
                ).long()

                noisy_latents = noise_scheduler.add_noise(latents, noise, timesteps)

                # SD inpainting UNet expects 9-channel input:
                # [noisy_latents (4), mask (1), masked_image_latents (4)]
                # Create the masked image: background is masked out (black),
                # garment is kept. This matches how CatVTON masks the person
                # image (preserves garment area, masks the body).
                mask_binary = (mask_values > 0.5).float()
                masked_image = pixel_values * mask_binary  # keep garment, black out bg
                with torch.no_grad():
                    masked_latents = vae.encode(masked_image).latent_dist.sample()
                    masked_latents = masked_latents * vae.config.scaling_factor

                mask_latents = F.interpolate(
                    mask_values,
                    size=(noisy_latents.shape[2], noisy_latents.shape[3]),
                    mode="nearest",
                )
                model_input = torch.cat([noisy_latents, mask_latents, masked_latents], dim=1)

                # Text encoding
                with torch.no_grad():
                    text_inputs = tokenizer(
                        captions, padding="max_length",
                        max_length=77, truncation=True,
                        return_tensors="pt",
                    ).to(accelerator.device)
                    encoder_hidden_states = text_encoder(text_inputs.input_ids)[0]

                noise_pred = unet(
                    model_input, timesteps,
                    encoder_hidden_states=encoder_hidden_states,
                ).sample

                loss = F.mse_loss(noise_pred.float(), noise.float(), reduction="mean")
                accelerator.backward(loss)

                if accelerator.sync_gradients:
                    accelerator.clip_grad_norm_(unet.parameters(), 1.0)

                optimizer.step()
                lr_scheduler.step()
                optimizer.zero_grad()

            if accelerator.sync_gradients:
                progress_bar.update(1)
                global_step += 1

                if args.tracking and accelerator.is_local_main_process:
                    accelerator.log({
                        "loss": loss.detach().item(),
                        "lr": lr_scheduler.get_last_lr()[0],
                        "step": global_step,
                    }, step=global_step)

                if global_step % args.checkpointing_steps == 0:
                    if accelerator.is_local_main_process:
                        save_path = os.path.join(args.output_dir, f"checkpoint-{global_step}")
                        accelerator.save_state(save_path)
                        logger.info(f"Saved checkpoint to {save_path}")

                        if args.use_lora:
                            lora_out = os.path.join(args.output_dir, f"lora-{global_step}")
                            accelerator.unwrap_model(unet).save_pretrained(lora_out)
                            logger.info(f"Saved LoRA to {lora_out}")

            # Validation
            if global_step % args.validation_steps == 0 and val_loader and accelerator.is_local_main_process:
                unet.eval()
                losses = []
                with torch.no_grad():
                    for vb in val_loader:
                        v_pix = vb["pixel_values"].to(accelerator.device, dtype=torch.bfloat16)
                        v_msk = vb["mask_values"].to(accelerator.device, dtype=torch.bfloat16)
                        v_cap = vb["caption"]
                        v_lat = vae.encode(v_pix).latent_dist.sample() * vae.config.scaling_factor
                        v_noise = torch.randn_like(v_lat)
                        v_ts = torch.randint(0, noise_scheduler.config.num_train_timesteps,
                                             (v_lat.shape[0],), device=v_lat.device).long()
                        v_ny = noise_scheduler.add_noise(v_lat, v_noise, v_ts)
                        # 9-channel inpainting input (same as training)
                        v_masked = v_pix * (v_msk > 0.5).float()
                        v_masked_lat = vae.encode(v_masked).latent_dist.sample() * vae.config.scaling_factor
                        v_ml = F.interpolate(v_msk, size=(v_ny.shape[2], v_ny.shape[3]), mode="nearest")
                        v_in = torch.cat([v_ny, v_ml, v_masked_lat], dim=1)
                        v_txt = tokenizer(v_cap, padding="max_length", max_length=77,
                                          truncation=True, return_tensors="pt").to(accelerator.device)
                        v_hid = text_encoder(v_txt.input_ids)[0]
                        v_pred = unet(v_in, v_ts, encoder_hidden_states=v_hid).sample
                        losses.append(F.mse_loss(v_pred.float(), v_noise.float(), reduction="mean").item())

                avg_val = sum(losses) / len(losses)
                logger.info(f"  val_loss: {avg_val:.6f}")
                if args.tracking:
                    accelerator.log({"val_loss": avg_val, "step": global_step}, step=global_step)
                unet.train()

            if global_step >= args.max_train_steps:
                break
        if global_step >= args.max_train_steps:
            break

    # Final save
    if accelerator.is_local_main_process:
        final_path = os.path.join(args.output_dir, "final")
        accelerator.save_state(final_path)

        if args.use_lora:
            final_lora = os.path.join(args.output_dir, "lora-final")
            accelerator.unwrap_model(unet).save_pretrained(final_lora)
            logger.info(f"✅ LoRA saved to {final_lora}")

            # Single safetensors file for easy uploading
            from safetensors.torch import save_file
            final_file = os.path.join(args.output_dir, "kanchuki-ethnic-wear-lora.safetensors")
            sd = {}
            for name, param in accelerator.unwrap_model(unet).named_parameters():
                if "lora" in name:
                    sd[name] = param
            save_file(sd, final_file)
            logger.info(f"✅ LoRA single file: {final_file}")

    accelerator.end_training()
    logger.info("✅ Training complete!")


# ─── CLI ───────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Fine-tune SD 1.5 CatVTON with LoRA on Indian ethnic wear dataset"
    )
    parser.add_argument("--dataset-path", type=str, required=True)
    parser.add_argument("--output-dir", type=str, default="./outputs/sd-ethnic-lora")

    parser.add_argument("--max-train-steps", type=int, default=DEFAULT_TRAIN_STEPS)
    parser.add_argument("--num-train-epochs", type=int, default=10)
    parser.add_argument("--train-batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--gradient-accumulation-steps", type=int, default=DEFAULT_GRAD_ACCUMULATION)
    parser.add_argument("--learning-rate", type=float, default=DEFAULT_LEARNING_RATE)
    parser.add_argument("--lr-scheduler", type=str, default="constant",
                        choices=["linear", "cosine", "constant", "constant_with_warmup"])
    parser.add_argument("--lr-warmup-steps", type=int, default=100)
    parser.add_argument("--seed", type=int, default=42)

    parser.add_argument("--use-lora", action="store_true", default=True)
    parser.add_argument("--lora-rank", type=int, default=DEFAULT_LORA_RANK)
    parser.add_argument("--mixed-precision", type=str, default="bf16",
                        choices=["no", "fp16", "bf16"])
    parser.add_argument("--height", type=int, default=DEFAULT_HEIGHT)
    parser.add_argument("--width", type=int, default=DEFAULT_WIDTH)
    parser.add_argument("--noise-offset", type=float, default=DEFAULT_NOISE_OFFSET)

    parser.add_argument("--use-8bit-adam", action="store_true", default=True)
    parser.add_argument("--num-workers", type=int, default=4)

    parser.add_argument("--validation-split", type=float, default=0.0)
    parser.add_argument("--validation-steps", type=int, default=500)
    parser.add_argument("--checkpointing-steps", type=int, default=500)
    parser.add_argument("--resume-from", type=str, default=None)

    parser.add_argument("--tracking", action="store_true", default=False)
    parser.add_argument("--wandb", action="store_true", default=False)

    args = parser.parse_args()

    if not os.path.exists(args.dataset_path):
        print(f"ERROR: Dataset not found: {args.dataset_path}")
        sys.exit(1)

    os.makedirs(args.output_dir, exist_ok=True)
    train(args)


if __name__ == "__main__":
    main()
