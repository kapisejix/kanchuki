# Fashion Try-On API Backend

A FastAPI-based backend service for virtual fashion try-on using AI.

## Features

- RESTful API endpoint for fashion try-on
- Support for tops, bottoms, and one-pieces
- Automatic GPU detection
- CORS enabled for frontend integration
- Health check endpoints

## Setup

### Prerequisites

- Python 3.12.11 or higher
- GPU recommended for faster processing

### Installation

```bash
# Install dependencies using uv
uv sync

# Or using pip
pip install -e .
```

### Model Weights

Ensure the model weights are downloaded to the `./models` directory. The TryOnPipeline will use these weights for inference.

## Running the Server

### Development Mode

```bash
python run.py
```

Or using uvicorn directly:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

### Production Mode

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

## API Endpoints

### Health Check

**GET** `/`
```json
{
  "status": "online",
  "message": "Fashion Try-On API is running"
}
```

**GET** `/health`
```json
{
  "status": "healthy",
  "pipeline_loaded": true
}
```

### Try-On Endpoint

**POST** `/try-on`

Processes a virtual try-on request and returns the result image.

**Parameters:**
- `person_image` (file, required): Image of the person (PNG, JPG, WEBP)
- `garment_image` (file, required): Image of the garment (PNG, JPG, WEBP)
- `category` (string, required): Type of garment - `"tops"`, `"bottoms"`, or `"one-pieces"`

**Response:**
- Returns a PNG image with the try-on result

**Example using cURL:**

```bash
curl -X POST "http://localhost:8000/try-on" \
  -F "person_image=@path/to/person.png" \
  -F "garment_image=@path/to/garment.png" \
  -F "category=tops" \
  --output result.png
```

**Example using Python requests:**

```python
import requests

url = "http://localhost:8000/try-on"

with open("person.png", "rb") as person_file, \
     open("garment.png", "rb") as garment_file:
    
    files = {
        "person_image": person_file,
        "garment_image": garment_file,
    }
    data = {
        "category": "tops"
    }
    
    response = requests.post(url, files=files, data=data)
    
    if response.status_code == 200:
        with open("result.png", "wb") as f:
            f.write(response.content)
        print("Success! Result saved to result.png")
    else:
        print(f"Error: {response.status_code} - {response.text}")
```

**Example using JavaScript/Fetch:**

```javascript
const formData = new FormData();
formData.append('person_image', personImageFile);
formData.append('garment_image', garmentImageFile);
formData.append('category', 'tops');

fetch('http://localhost:8000/try-on', {
  method: 'POST',
  body: formData
})
  .then(response => response.blob())
  .then(blob => {
    const url = URL.createObjectURL(blob);
    // Use the image URL (e.g., set as img src)
  });
```

## API Documentation

Once the server is running, you can access:
- **Interactive API docs (Swagger UI)**: http://localhost:8000/docs
- **Alternative API docs (ReDoc)**: http://localhost:8000/redoc
- **OpenAPI schema**: http://localhost:8000/openapi.json

## Error Handling

The API returns appropriate HTTP status codes:
- `200`: Success
- `400`: Bad request (invalid image type or category)
- `500`: Internal server error (processing failed)
- `503`: Service unavailable (pipeline not initialized)

## Configuration

### CORS

By default, CORS is enabled for all origins. For production, update the CORS settings in `main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://yourdomain.com"],  # Specify allowed origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Model Directory

The model weights directory can be configured in the `startup_event` function in `main.py`.

## Development

### Project Structure

```
backend/
├── main.py           # FastAPI application
├── run.py            # Development server runner
├── pyproject.toml    # Project dependencies
├── README.md         # This file
└── models/           # Model weights directory
```

## License

See the main project LICENSE file.
