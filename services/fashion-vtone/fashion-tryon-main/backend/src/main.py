import io
from typing import Literal
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fashn_vton import TryOnPipeline
from PIL import Image

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


pipeline = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the try-on pipeline on startup"""
    global pipeline
    logger.info("Initializing TryOnPipeline...")
    try:
        pipeline = TryOnPipeline(weights_dir="./models")
        logger.info("TryOnPipeline initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize pipeline: {e}")
        raise
    yield
    pipeline.unload()
    logger.info("TryOnPipeline unloaded successfully")


# Initialize FastAPI app
app = FastAPI(
    title="Fashion Try-On API",
    description="API for virtual fashion try-on using AI",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "online",
        "message": "Fashion Try-On API is running"
    }


@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "pipeline_loaded": pipeline is not None
    }


@app.post("/try-on")
async def try_on(
    person_image: UploadFile = File(..., description="Person image file"),
    garment_image: UploadFile = File(..., description="Garment image file"),
    category: Literal["tops", "bottoms", "one-pieces"] = Form(..., description="Garment category")
):
    """
    Virtual try-on endpoint
    
    Args:
        person_image: Image of the person (PNG, JPG, WEBP)
        garment_image: Image of the garment (PNG, JPG, WEBP)
        category: Type of garment - "tops", "bottoms", or "one-pieces"
    
    Returns:
        Result image as PNG
    """
    if pipeline is None:
        raise HTTPException(
            status_code=503,
            detail="Pipeline not initialized. Please try again later."
        )
    
    try:
        # Validate file types
        allowed_types = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
        
        if person_image.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid person image type: {person_image.content_type}. Allowed: PNG, JPG, WEBP"
            )
        
        if garment_image.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid garment image type: {garment_image.content_type}. Allowed: PNG, JPG, WEBP"
            )
        
        logger.info(f"Processing try-on request with category: {category}")
        
        # Read and convert images
        person_bytes = await person_image.read()
        garment_bytes = await garment_image.read()
        
        person = Image.open(io.BytesIO(person_bytes)).convert("RGB")
        garment = Image.open(io.BytesIO(garment_bytes)).convert("RGB")
        
        logger.info(f"Person image size: {person.size}, Garment image size: {garment.size}")
        
        # Run inference
        result = pipeline(
            person_image=person,
            garment_image=garment,
            category=category,
        )
        
        # Convert result to bytes
        output_image = result.images[0]
        img_byte_arr = io.BytesIO()
        output_image.save(img_byte_arr, format='PNG')
        img_byte_arr.seek(0)
        
        logger.info("Try-on processing completed successfully")
        
        # Return image as streaming response
        return StreamingResponse(
            img_byte_arr,
            media_type="image/png",
            headers={
                "Content-Disposition": "inline; filename=tryon_result.png"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during try-on processing: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process try-on: {str(e)}"
        )
