"""
CatVTON-FLUX LoRA Fine-Tuning for Indian Ethnic Wear
======================================================
LoRA fine-tunes CatVTON-FLUX on a dataset of Indian ethnic wear images
to improve saree draping, lehenga flare, and unstitched suit handling.

Requirements:
    - GPU with 24GB+ VRAM (RTX 3090/4090, A100, H100)
    - Prepared dataset (run scripts/dataset/prepare_dataset.py first)
    - ~2-4 hours for 2000 steps on RTX 4090

Usage:
    # Basic training
    accelerate launch train_lora.py \
        --dataset-path ../../dataset/flux-training \
        --output-dir ./outputs/ethnic-wear-lora

    # Resume from checkpoint
    accelerate launch train_lora.py \
        --dataset-path ../../dataset/flux-training \
        --output-dir ./outputs/ethnic-wear-lora \
        --resume-from ./outputs/ethnic-wear-lora/checkpoint-1000
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
from diffusers import FluxTransformer2DModel, AutoencoderKL, FlowMatchEulerDiscreteScheduler
from diffusers.optimization import get_scheduler
from diffusers.utils import check_min_version
from PIL import Image
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from tqdm import tqdm
from transformers import CLIPTokenizer, CLIPTextModel

# Check diffusers version
check_min_version("0.27.0")

logger = get_logger(__name__)


# ─── Constants ─────────────────────────────────────────────────

# CatVTON-FLUX base models — pre-trained weights available on HuggingFace
# IMPORTANT: We load the INPAINT model (xiaozaa/flux1-fill-dev-diffusers) as the base,
# because CatVTON-FLUX modifies FLUX.1-dev with spatial concatenation of mask + image.
# Without this, the transformer won't accept the 32-channel input used by CatVTON.
CATVTON_FLUX_BASE = "xiaozaa/flux1-fill-dev-diffusers"  # CatVTON inpainting model

# Default image size for CatVTON-FLUX
DEFAULT_HEIGHT = 768
DEFAULT_WIDTH = 576

# Default LoRA hyperparameters
DEFAULT_LORA_RANK = 32
DEFAULT_LORA_ALPHA = 16
DEFAULT_LEARNING_RATE = 1e-4
DEFAULT_TRAIN_STEPS = 3000
DEFAULT_BATCH_SIZE = 1
DEFAULT_GRAD_ACCUMULATION = 4


# ─── Dataset ──────────────────────────────────────────────────

class EthnicWearDataset(Dataset):
    """
    Dataset for CatVTON-FLUX LoRA training.
    
    Expects the directory structure from prepare_dataset.py (flux-lora format):
        dataset/
        ├── kanchuki_00001.jpg      # Garment images
        ├── kanchuki_00001_mask.png # Segmentation masks (optional)
        ├── captions/
        │   └── kanchuki_00001.txt  # Caption for each image
        └── dataset.json            # Manifest
    """
    
    def __init__(self, dataset_path: str, height: int = DEFAULT_HEIGHT, width: int = DEFAULT_WIDTH,
                 validation_split: float = 0.0, is_validation: bool = False):
        self.dataset_path = Path(dataset_path)
        self.height = height
        self.width = width
        
        # Load manifest
        manifest_path = self.dataset_path / "dataset.json"
        if not manifest_path.exists():
            raise FileNotFoundError(f"dataset.json not found at {manifest_path}")
        
        with open(manifest_path) as f:
            self.manifest = json.load(f)
        
        all_entries = self.manifest["entries"]
        
        # Split into train/validation
        if validation_split > 0:
            split_idx = int(len(all_entries) * (1 - validation_split))
            if is_validation:
                self.entries = all_entries[split_idx:]
            else:
                self.entries = all_entries[:split_idx]
            logger.info(f"Dataset split: {len(all_entries)} total → "
                       f"{len(all_entries[:split_idx])} train / {len(all_entries[split_idx:])} val")
        else:
            self.entries = all_entries
        
        logger.info(f"Loaded dataset: {len(self.entries)} images from {dataset_path}")
        
        # Image transforms with augmentation for training
        self.train_transform = transforms.Compose([
            transforms.Resize((height, width), interpolation=transforms.InterpolationMode.BILINEAR),
            transforms.RandomHorizontalFlip(p=0.3),
            transforms.ColorJitter(brightness=0.05, contrast=0.05, saturation=0.05, hue=0.02),
            transforms.ToTensor(),
            transforms.Normalize([0.5], [0.5]),  # Normalize to [-1, 1]
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
        
        # Load image
        img_path = self.dataset_path / entry["image"]
        image = Image.open(img_path).convert("RGB")
        image_tensor = self.val_transform(image) if self.is_validation else self.train_transform(image)
        
        # Load mask (white image if no mask). Works for .jpg, .jpeg, .png, .webp.
        img_stem = Path(entry["image"]).stem
        mask_path_full = self.dataset_path / f"{img_stem}_mask.png"
        if entry.get("has_mask") and mask_path_full.exists():
            mask = Image.open(mask_path_full).convert("L")
        else:
            # Product photos: garment fills the frame, so full white mask is correct
            mask = Image.new("L", (self.width, self.height), 255)
        
        mask_tensor = self.mask_transform(mask)
        
        # Load caption
        caption = entry.get("caption", "An Indian ethnic wear garment")
        
        return {
            "pixel_values": image_tensor,
            "mask_values": mask_tensor,
            "caption": caption,
        }


# ─── Model Loading ────────────────────────────────────────────

def load_models(accelerator: Accelerator, use_lora: bool = True, lora_rank: int = DEFAULT_LORA_RANK):
    """
    Load CatVTON-FLUX model components with optional LoRA.
    
    Returns: (transformer, vae, text_encoder, tokenizer, noise_scheduler)
    """
    logger.info("Loading CatVTON-FLUX inpainting model (xiaozaa/flux1-fill-dev-diffusers)...")
    weight_dtype = torch.bfloat16 if accelerator.mixed_precision == "bf16" else torch.float32
    
    # Load transformer from the CatVTON-FLUX inpainting checkpoint
    # This model has in_channels=32 to accept the concatenated (latents + mask) input.
    transformer = FluxTransformer2DModel.from_pretrained(
        CATVTON_FLUX_BASE,
        subfolder="transformer",
        torch_dtype=weight_dtype,
    )
    
    # Apply LoRA if requested
    if use_lora:
        from peft import LoraConfig, get_peft_model
        
        lora_config = LoraConfig(
            r=lora_rank,
            lora_alpha=lora_rank // 2,
            target_modules=[
                "q_proj", "k_proj", "v_proj", "o_proj",
                "ff.net.0.proj", "ff.net.2.proj",
            ],
            lora_dropout=0.05,
            bias="none",
        )
        transformer = get_peft_model(transformer, lora_config)
        transformer.print_trainable_parameters()
    
    # Load VAE
    vae = AutoencoderKL.from_pretrained(
        CATVTON_FLUX_BASE,
        subfolder="vae",
        torch_dtype=weight_dtype,
    )
    
    # Load text encoders
    text_encoder = CLIPTextModel.from_pretrained(
        CATVTON_FLUX_BASE,
        subfolder="text_encoder",
        torch_dtype=weight_dtype,
    )
    
    tokenizer = CLIPTokenizer.from_pretrained(
        CATVTON_FLUX_BASE,
        subfolder="tokenizer",
    )
    
    # Load noise scheduler
    noise_scheduler = FlowMatchEulerDiscreteScheduler.from_pretrained(
        CATVTON_FLUX_BASE,
        subfolder="scheduler",
    )
    
    return transformer, vae, text_encoder, tokenizer, noise_scheduler


# ─── Training Function ───────────────────────────────────────

def train(args):
    """Main training loop."""
    
    # Initialize accelerator
    accelerator = Accelerator(
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        mixed_precision=args.mixed_precision,
        log_with="tensorboard" if args.tracking else None,
        project_dir=args.output_dir,
    )
    
    set_seed(args.seed)
    
    # Load datasets (with optional validation split)
    train_dataset = EthnicWearDataset(
        dataset_path=args.dataset_path,
        height=args.height,
        width=args.width,
        validation_split=args.validation_split,
        is_validation=False,
    )
    
    train_dataloader = DataLoader(
        train_dataset,
        batch_size=args.train_batch_size,
        shuffle=True,
        num_workers=args.num_workers,
    )
    
    # Validation dataset
    val_dataloader = None
    if args.validation_split > 0:
        val_dataset = EthnicWearDataset(
            dataset_path=args.dataset_path,
            height=args.height,
            width=args.width,
            validation_split=args.validation_split,
            is_validation=True,
        )
        val_dataloader = DataLoader(
            val_dataset,
            batch_size=args.train_batch_size,
            shuffle=False,
            num_workers=args.num_workers,
        )
    
    # Load models
    transformer, vae, text_encoder, tokenizer, noise_scheduler = load_models(
        accelerator,
        use_lora=args.use_lora,
        lora_rank=args.lora_rank,
    )
    
    # Freeze VAE and text encoder
    vae.requires_grad_(False)
    text_encoder.requires_grad_(False)
    
    # Set up optimizer
    if args.use_8bit_adam:
        try:
            import bitsandbytes as bnb
            optimizer_class = bnb.optim.AdamW8bit
        except ImportError:
            logger.warning("bitsandbytes not installed, using regular AdamW")
            optimizer_class = torch.optim.AdamW
    else:
        optimizer_class = torch.optim.AdamW
    
    optimizer = optimizer_class(
        transformer.parameters(),
        lr=args.learning_rate,
        betas=(0.9, 0.999),
        weight_decay=1e-2,
        eps=1e-8,
    )
    
    # Set up LR scheduler
    lr_scheduler = get_scheduler(
        args.lr_scheduler,
        optimizer=optimizer,
        num_warmup_steps=args.lr_warmup_steps,
        num_training_steps=args.max_train_steps * args.gradient_accumulation_steps,
    )
    
    # Prepare with accelerator
    transformer, optimizer, train_dataloader, lr_scheduler = accelerator.prepare(
        transformer, optimizer, train_dataloader, lr_scheduler
    )
    
    # Move frozen models to device
    vae = vae.to(accelerator.device)
    text_encoder = text_encoder.to(accelerator.device)
    
    # Trackers
    if args.tracking:
        accelerator.init_trackers("catvton-ethnic-wear", config=vars(args))
    
    # Training loop
    global_step = 0
    first_epoch = 0
    
    # Resume from checkpoint
    if args.resume_from:
        accelerator.load_state(args.resume_from)
        # Extract step from checkpoint path
        if "checkpoint" in args.resume_from:
            global_step = int(args.resume_from.split("-")[-1])
            first_epoch = global_step // len(train_dataloader)
        logger.info(f"Resumed from {args.resume_from}, step {global_step}")
    
    progress_bar = tqdm(
        range(global_step, args.max_train_steps),
        desc="Steps",
        disable=not accelerator.is_local_main_process,
        initial=global_step,
    )
    
    transformer.train()
    
    for epoch in range(first_epoch, args.num_train_epochs):
        for step, batch in enumerate(train_dataloader):
            with accelerator.accumulate(transformer):
                # Get images, masks, captions
                pixel_values = batch["pixel_values"].to(accelerator.device, dtype=torch.bfloat16)
                mask_values = batch["mask_values"].to(accelerator.device, dtype=torch.bfloat16)
                captions = batch["caption"]
                
                # Encode images to latent space
                with torch.no_grad():
                    latents = vae.encode(pixel_values).latent_dist.sample()
                    latents = latents * vae.config.scaling_factor
                
                # Sample noise
                noise = torch.randn_like(latents)
                bsz = latents.shape[0]
                
                # Sample a random timestep
                timesteps = torch.randint(
                    0, noise_scheduler.config.num_train_timesteps,
                    (bsz,), device=latents.device,
                ).long()
                
                # Add noise to latents
                noisy_latents = noise_scheduler.add_noise(latents, noise, timesteps)
                
                # Concatenate mask with noisy latents (CatVTON approach)
                mask_latents = F.interpolate(
                    mask_values,
                    size=(noisy_latents.shape[2], noisy_latents.shape[3]),
                    mode="nearest",
                )
                model_input = torch.cat([noisy_latents, mask_latents], dim=1)
                
                # Encode captions
                with torch.no_grad():
                    text_inputs = tokenizer(
                        captions,
                        padding="max_length",
                        max_length=77,
                        truncation=True,
                        return_tensors="pt",
                    ).to(accelerator.device)
                    encoder_hidden_states = text_encoder(text_inputs.input_ids)[0]
                
                # Predict the noise residual
                noise_pred = transformer(
                    model_input,
                    timesteps,
                    encoder_hidden_states=encoder_hidden_states,
                ).sample
                
                # Loss: simple MSE on the noise prediction
                loss = F.mse_loss(noise_pred.float(), noise.float(), reduction="mean")
                
                # Backward pass
                accelerator.backward(loss)
                
                if accelerator.sync_gradients:
                    accelerator.clip_grad_norm_(transformer.parameters(), 1.0)
                
                optimizer.step()
                lr_scheduler.step()
                optimizer.zero_grad()
            
            # Logging
            if accelerator.sync_gradients:
                progress_bar.update(1)
                global_step += 1
                
                if args.tracking and accelerator.is_local_main_process:
                    accelerator.log({
                        "loss": loss.detach().item(),
                        "lr": lr_scheduler.get_last_lr()[0],
                        "step": global_step,
                    }, step=global_step)
                
                # Save checkpoint
                if global_step % args.checkpointing_steps == 0:
                    if accelerator.is_local_main_process:
                        save_path = os.path.join(args.output_dir, f"checkpoint-{global_step}")
                        accelerator.save_state(save_path)
                        logger.info(f"Saved checkpoint to {save_path}")
                        
                        # Save LoRA weights separately for easy loading
                        if args.use_lora:
                            lora_path = os.path.join(args.output_dir, f"lora-{global_step}.safetensors")
                            accelerator.unwrap_model(transformer).save_pretrained(
                                os.path.join(args.output_dir, f"lora-{global_step}")
                            )
                            logger.info(f"Saved LoRA weights to {os.path.join(args.output_dir, f'lora-{global_step}')}")
            
            # Validation step
            if global_step % args.validation_steps == 0 and val_dataloader is not None and accelerator.is_local_main_process:
                transformer.eval()
                val_losses = []
                with torch.no_grad():
                    for val_batch in val_dataloader:
                        v_pixel = val_batch["pixel_values"].to(accelerator.device, dtype=torch.bfloat16)
                        v_mask = val_batch["mask_values"].to(accelerator.device, dtype=torch.bfloat16)
                        v_captions = val_batch["caption"]
                        
                        v_latents = vae.encode(v_pixel).latent_dist.sample() * vae.config.scaling_factor
                        v_noise = torch.randn_like(v_latents)
                        v_timesteps = torch.randint(
                            0, noise_scheduler.config.num_train_timesteps,
                            (v_latents.shape[0],), device=v_latents.device,
                        ).long()
                        v_noisy = noise_scheduler.add_noise(v_latents, v_noise, v_timesteps)
                        v_mask_latents = F.interpolate(v_mask, size=(v_noisy.shape[2], v_noisy.shape[3]), mode="nearest")
                        v_input = torch.cat([v_noisy, v_mask_latents], dim=1)
                        
                        v_text = tokenizer(v_captions, padding="max_length", max_length=77, truncation=True, return_tensors="pt").to(accelerator.device)
                        v_hidden = text_encoder(v_text.input_ids)[0]
                        v_pred = transformer(v_input, v_timesteps, encoder_hidden_states=v_hidden).sample
                        val_losses.append(F.mse_loss(v_pred.float(), v_noise.float(), reduction="mean").item())
                
                avg_val_loss = sum(val_losses) / len(val_losses)
                logger.info(f"  val_loss: {avg_val_loss:.6f}")
                if args.tracking:
                    accelerator.log({"val_loss": avg_val_loss, "step": global_step}, step=global_step)
                transformer.train()
            
            if global_step >= args.max_train_steps:
                break
        
        if global_step >= args.max_train_steps:
            break
    
    # Final save
    if accelerator.is_local_main_process:
        final_path = os.path.join(args.output_dir, "final")
        accelerator.save_state(final_path)
        
        if args.use_lora:
            final_lora_path = os.path.join(args.output_dir, "lora-final")
            accelerator.unwrap_model(transformer).save_pretrained(final_lora_path)
            logger.info(f"✅ Final LoRA saved to {final_lora_path}")
            
            # Also save as single safetensors file for easy loading
            from safetensors.torch import save_file
            final_file = os.path.join(args.output_dir, "kanchuki-ethnic-wear-lora.safetensors")
            state_dict = {}
            for name, param in accelerator.unwrap_model(transformer).named_parameters():
                if "lora" in name:
                    state_dict[name] = param
            save_file(state_dict, final_file)
            logger.info(f"✅ LoRA weights saved as single file: {final_file}")
    
    accelerator.end_training()
    logger.info("✅ Training complete!")


# ─── CLI ───────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Fine-tune CatVTON-FLUX with LoRA on Indian ethnic wear dataset"
    )
    
    # Dataset
    parser.add_argument("--dataset-path", type=str, required=True,
                        help="Path to prepared dataset (from prepare_dataset.py)")
    
    # Output
    parser.add_argument("--output-dir", type=str, default="./outputs/catvton-ethnic-lora",
                        help="Output directory for checkpoints and final model")
    
    # Training
    parser.add_argument("--max-train-steps", type=int, default=DEFAULT_TRAIN_STEPS,
                        help="Total training steps")
    parser.add_argument("--num-train-epochs", type=int, default=10,
                        help="Number of training epochs")
    parser.add_argument("--train-batch-size", type=int, default=DEFAULT_BATCH_SIZE,
                        help="Batch size per GPU")
    parser.add_argument("--gradient-accumulation-steps", type=int, default=DEFAULT_GRAD_ACCUMULATION,
                        help="Gradient accumulation steps")
    parser.add_argument("--learning-rate", type=float, default=DEFAULT_LEARNING_RATE,
                        help="Learning rate")
    parser.add_argument("--lr-scheduler", type=str, default="constant",
                        choices=["linear", "cosine", "constant", "constant_with_warmup"])
    parser.add_argument("--lr-warmup-steps", type=int, default=100,
                        help="LR warmup steps")
    parser.add_argument("--seed", type=int, default=42,
                        help="Random seed")
    
    # Model
    parser.add_argument("--use-lora", action="store_true", default=True,
                        help="Use LoRA for fine-tuning (instead of full fine-tune)")
    parser.add_argument("--lora-rank", type=int, default=DEFAULT_LORA_RANK,
                        help="LoRA rank (higher = more capacity, more memory)")
    parser.add_argument("--mixed-precision", type=str, default="bf16",
                        choices=["no", "fp16", "bf16"])
    parser.add_argument("--height", type=int, default=DEFAULT_HEIGHT,
                        help="Training image height")
    parser.add_argument("--width", type=int, default=DEFAULT_WIDTH,
                        help="Training image width")
    
    # Optimization
    parser.add_argument("--use-8bit-adam", action="store_true", default=True,
                        help="Use 8-bit AdamW optimizer (reduces memory)")
    parser.add_argument("--num-workers", type=int, default=4,
                        help="Data loader workers")
    
    # Checkpointing
    # Validation
    parser.add_argument("--validation-split", type=float, default=0.0,
                        help="Fraction of data to hold out for validation (e.g. 0.1)")
    parser.add_argument("--validation-steps", type=int, default=500,
                        help="Run validation every N training steps")
    
    # Checkpointing
    parser.add_argument("--checkpointing-steps", type=int, default=500,
                        help="Save checkpoint every N steps")
    parser.add_argument("--resume-from", type=str, default=None,
                        help="Resume from checkpoint path")
    
    # Tracking
    parser.add_argument("--tracking", action="store_true", default=False,
                        help="Enable TensorBoard logging")
    parser.add_argument("--wandb", action="store_true", default=False,
                        help="Enable Weights & Biases logging")
    
    args = parser.parse_args()
    
    # Validate paths
    if not os.path.exists(args.dataset_path):
        print(f"ERROR: Dataset path not found: {args.dataset_path}")
        print("Run scripts/dataset/prepare_dataset.py first to prepare the dataset.")
        sys.exit(1)
    
    os.makedirs(args.output_dir, exist_ok=True)
    
    train(args)


if __name__ == "__main__":
    main()
