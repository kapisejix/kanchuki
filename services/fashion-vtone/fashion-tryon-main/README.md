# Fashion Try-On - AI Virtual Fitting Room

A full-stack AI-powered virtual fashion try-on application that allows users to see how clothes look on them before buying. Upload a photo of yourself and a garment image, and our AI will create a realistic virtual fitting.

![Fashion Try-On](https://img.shields.io/badge/AI-Powered-purple)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![FastAPI](https://img.shields.io/badge/FastAPI-Python-green)

## Features

- 🤖 **AI-Powered Virtual Try-On**: State-of-the-art deep learning model for realistic results
- 🎨 **Modern UI**: Beautiful, responsive interface with dark mode support
- ⚡ **Fast Processing**: Optimized pipeline for quick results
- 📱 **Mobile-Friendly**: Works seamlessly on all devices
- 🔒 **Privacy-First**: Images are processed securely and not stored
- 📥 **Download Results**: Save your virtual try-on images
- 👔 **Multiple Categories**: Support for tops, bottoms, and one-pieces

## Tech Stack

### Frontend
- **Next.js 16** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS v4** - Modern styling
- **Lucide React** - Icon library

### Backend
- **FastAPI** - High-performance Python web framework
- **Uvicorn** - ASGI server
- **fashn-vton-1.5** - AI model for virtual try-on from Hugging Face
- **DWPose** - Pose detection model for accurate fitting
- **Pillow** - Image processing

## AI Models

This project uses two state-of-the-art models from [FASHN AI](https://huggingface.co/fashn-ai):

### 1. FASHN VTON v1.5 (Main Try-On Model)
- **Source**: [fashn-ai/fashn-vton-1.5](https://huggingface.co/fashn-ai/fashn-vton-1.5)
- **Size**: 1.94 GB
- **Type**: Image-to-Image diffusion model (MMDiT)
- **License**: Apache 2.0
- **Description**: State-of-the-art virtual try-on model that generates photorealistic results in pixel space

### 2. DWPose (Pose Detection)
- **Source**: [fashn-ai/DWPose](https://huggingface.co/fashn-ai/DWPose)
- **Size**: 351 MB (2 ONNX models)
- **Type**: Whole-body keypoint detection
- **License**: Apache 2.0
- **Files**:
  - `dw-ll_ucoco_384.onnx` (134 MB) - Pose estimation model
  - `yolox_l.onnx` (217 MB) - Object detection model

### Model Setup

The models are automatically downloaded by the `fashn-vton` library on first run. They will be cached in the default Hugging Face cache directory (`~/.cache/huggingface/`).

Alternatively, you can manually download them:

```bash
# Using huggingface-cli (recommended)
pip install -U "huggingface_hub[cli]"

# Download FASHN VTON v1.5
huggingface-cli download fashn-ai/fashn-vton-1.5

# Download DWPose
huggingface-cli download fashn-ai/DWPose
```

Or specify a custom directory in the backend:

```python
# In backend/src/main.py
pipeline = TryOnPipeline(weights_dir="./models")
```

### How the Models Work Together

```
┌─────────────────────────────────────────────────────────────┐
│                    Virtual Try-On Pipeline                   │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
         ┌───────────────────────────────────────┐
         │  Input: Person Image + Garment Image  │
         └───────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    ▼                 ▼
         ┌──────────────────┐  ┌──────────────────┐
         │  DWPose Model    │  │ Garment Analysis │
         │  (Pose Detection)│  │                  │
         └──────────────────┘  └──────────────────┘
         │                              │
         │ • Detect body keypoints      │
         │ • Whole-body estimation      │
         │ • YOLOX for detection        │
         │ • dw-ll_ucoco for pose       │
         │                              │
         └───────────┬──────────────────┘
                     ▼
         ┌──────────────────────────┐
         │  FASHN VTON v1.5 Model   │
         │  (MMDiT Diffusion)       │
         └──────────────────────────┘
         │
         │ • Combines person pose with garment
         │ • Preserves body shape and proportions
         │ • Generates photorealistic result
         │ • Pixel-space generation
         │
         ▼
         ┌──────────────────────┐
         │  Output: Try-On Image │
         └──────────────────────┘
```

## Project Structure

```
fashion-tryon/
├── frontend/                              # Next.js application
│   ├── src/           
│   │   ├── app/                           # App Router pages
│   │   │   ├── page.tsx                   # Homepage
│   │   │   ├── layout.tsx                 # Root layout
│   │   │   ├── globals.css                # Global styles
│   │   │   ├── upload/           
│   │   │   │   └── page.tsx               # Upload page
│   │   │   └── result/           
│   │   │       └── page.tsx               # Result comparison page
│   │   ├── components/                    # Reusable UI components
│   │   │   ├── Navbar.tsx                 # Navigation component
│   │   │   └── ImageUpload.tsx            # Image upload component
│   │   ├── lib/                           # Utilities
│   │   │   └── api.ts                     # API client functions
│   │   └── types/                         # TypeScript definitions
│   │       └── index.ts                   # Type definitions
│   ├── public/                            # Static assets
│   ├── .env.local                         # Environment variables (create this)
│   ├── .env.example                       # Environment template
│   ├── package.json                       # Node dependencies
│   ├── tsconfig.json                      # TypeScript config
│   └── tailwind.config.js                 # Tailwind CSS config
│
├── backend/                               # FastAPI application
│   ├── src/           
│   │   └── main.py                        # API endpoints and FastAPI app
│   ├── models/                            # Model weights (optional custom location)
│   │   ├── model.safetensor               # FASHN VTON model
│   │   └── dwpose/                        # Pose detection models
│   │       └── dw-ll_ucoco_384.onnx       # Type definitions
│   │       └── yolox_l.onnx               # Type definitions
│   ├── run.py                             # Development server launcher
│   ├── pyproject.toml                     # Python dependencies (UV format)
│   ├── requirements.txt                   # Python dependencies (pip format)
│   ├── uv.lock                            # UV lock file
│   └── README.md                          # Backend documentation
│
├── .gitignore                             # Git ignore patterns
├── README.md                              # This file
├── SETUP.md                               # Setup instructions
├── start-dev.sh                           # Start both servers script
└── stop-dev.sh                            # Stop all servers script
```

## Quick Start

### Prerequisites

- **Frontend**: Node.js 20+, pnpm (or npm/yarn)
- **Backend**: Python 3.12+, UV or pip
- **Optional**: GPU for faster processing (CPU works but slower)

### 1. Backend Setup

```bash
cd backend

# Install dependencies using UV (recommended)
uv sync

# Or using pip
pip install -e .

# Models will be automatically downloaded on first run
# They will be cached in ~/.cache/huggingface/

# Start the API server
python run.py
```

The API will be available at `http://localhost:8080`

**Note**: On first run, the models (FASHN VTON v1.5 and DWPose) will be automatically downloaded from Hugging Face. This may take a few minutes depending on your internet connection (~2.3 GB total).

📖 See [backend/README.md](backend/README.md) for detailed backend documentation.

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env.local

# Start development server
pnpm dev
```

The app will be available at `http://localhost:3000`

📖 See [frontend/README.md](frontend/README.md) for detailed frontend documentation.

## Usage

### 1. Homepage
Visit the homepage to learn about how the virtual try-on works and its features.

### 2. Upload Page
1. Click "Try It Now" or navigate to `/upload`
2. Upload your photo (person image)
3. Upload the garment image you want to try on
4. Select the garment category:
   - **Tops**: Shirts, t-shirts, jackets, etc.
   - **Bottoms**: Pants, jeans, skirts, etc.
   - **One-pieces**: Dresses, jumpsuits, etc.
5. Click "Generate Try-On"

### 3. Result Page
- View a side-by-side comparison of:
  - Your original photo
  - The garment image
  - The virtual try-on result
- Download the result image
- Try another outfit

## API Documentation

Once the backend is running, access the interactive API documentation:

- **Swagger UI**: http://localhost:8080/docs
- **ReDoc**: http://localhost:8080/redoc

### Main Endpoint

**POST** `/try-on`

Upload images and get virtual try-on result.

**Request:**
- `person_image` (file): Your photo
- `garment_image` (file): Garment to try on
- `category` (string): "tops", "bottoms", or "one-pieces"

**Response:**
- PNG image with the try-on result

**Example using cURL:**

```bash
curl -X POST "http://localhost:8080/try-on" \
  -F "person_image=@person.png" \
  -F "garment_image=@garment.png" \
  -F "category=tops" \
  --output result.png
```

## Configuration

### Frontend Environment Variables

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8080
```

### Backend Configuration

The backend can be configured in `backend/src/main.py`:

- **Model directory**: Change `weights_dir` in the lifespan function (default uses Hugging Face cache)
- **CORS settings**: Update `allow_origins` for production (currently allows all origins)
- **Port**: Modify in `run.py` (default: 8080)

**Custom Model Directory:**
```python
# In backend/src/main.py, modify the lifespan function:
pipeline = TryOnPipeline(weights_dir="./models")  # Use local models folder
# OR
pipeline = TryOnPipeline()  # Use default HuggingFace cache (~/.cache/huggingface/)
```

## Development

### Frontend Development

```bash
cd frontend
pnpm dev          # Start dev server
pnpm build        # Build for production
pnpm start        # Start production server
pnpm lint         # Run linter
```

### Backend Development

```bash
cd backend
python run.py     # Start with auto-reload
uvicorn main:app --reload  # Alternative way
```

## Tips for Best Results

1. ✅ **Use clear, well-lit photos** with good resolution
2. ✅ **Ensure the person faces forward** in the photo
3. ✅ **Use garment images without models** (flat lay or on hanger)
4. ✅ **Select the correct category** for accurate fitting
5. ✅ **Avoid low resolution or blurry images**

## Performance

- **Processing Time**: 10-30 seconds per image (depends on image size and hardware)
- **GPU Acceleration**: Automatically detected and used if available (CUDA required)
- **Supported Formats**: PNG, JPG/JPEG, WEBP
- **Model Size**: ~2.3 GB total (downloaded once and cached)
- **Memory Requirements**: 
  - CPU: 8GB RAM minimum, 16GB recommended
  - GPU: 8GB VRAM minimum, 12GB+ recommended

## Troubleshooting

### Backend Issues

**Pipeline initialization failed:**
- Models will auto-download on first run - ensure stable internet connection
- Check Python version (requires 3.12+)
- Verify all dependencies are installed: `uv sync` or `pip install -e .`
- Check disk space (~2.3 GB needed for models)
- Check logs for specific errors: Model downloads from Hugging Face

**Models not downloading:**
```bash
# Manually download models
pip install -U "huggingface_hub[cli]"
huggingface-cli download fashn-ai/fashn-vton-1.5
huggingface-cli download fashn-ai/DWPose

# Check cache location
ls ~/.cache/huggingface/hub/
```

**Port already in use:**
```bash
# Change port in backend/run.py or use:
uvicorn src.main:app --port 8001
```

**Out of memory errors:**
- Ensure sufficient RAM (16GB recommended) or VRAM (12GB+ for GPU)
- Try with smaller images (resize to max 1024px)
- Close other memory-intensive applications

### Frontend Issues

**Cannot connect to API:**
- Verify backend is running at the URL specified in `.env.local`
- Check CORS settings in backend
- Ensure no firewall is blocking the connection

**Build errors:**
```bash
rm -rf .next node_modules
pnpm install
pnpm build
```

## Deployment

### Frontend (Vercel)

1. Push code to GitHub
2. Import project in Vercel
3. Set environment variable: `NEXT_PUBLIC_API_URL`
4. Deploy

### Backend (Railway/Render/AWS)

1. Ensure `models/` directory is accessible
2. Set environment variables if needed
3. Use `uvicorn main:app --host 0.0.0.0 --port $PORT`

### Docker

See individual README files in `frontend/` and `backend/` for Docker instructions.

## Roadmap

- [ ] User authentication and history
- [ ] Batch processing multiple garments
- [ ] Social sharing features
- [ ] Advanced editing options
- [ ] Mobile apps (iOS/Android)

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [FASHN AI](https://huggingface.co/fashn-ai) - For the amazing AI models
  - [fashn-vton-1.5](https://huggingface.co/fashn-ai/fashn-vton-1.5) - Virtual try-on model
  - [DWPose](https://huggingface.co/fashn-ai/DWPose) - Pose detection model
- [fashn-vton GitHub](https://github.com/fashn-AI/fashn-vton-1.5) - Python library for virtual try-on
- Next.js team for the amazing framework
- FastAPI for the excellent Python web framework
- Hugging Face for model hosting and infrastructure

## Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Check existing documentation in `frontend/` and `backend/` folders

---

Made with ❤️ using AI technology
