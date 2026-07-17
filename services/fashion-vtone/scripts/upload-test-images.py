#!/usr/bin/env python3
"""Upload test images to R2, then test the V-Tone try-on service."""

import os
import sys
import time
import io
import requests

from PIL import Image, ImageDraw

# --- Try to use python-dotenv, else read .env manually ----------

def load_dotenv(path='.env'):
    """Simple .env loader - reads KEY="VALUE" lines."""
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' in line:
                    # Split on first =
                    key, _, val = line.partition('=')
                    # Remove quotes
                    val = val.strip().strip('"').strip("'")
                    # Remove inline comments
                    if ' #' in val:
                        val = val.split(' #')[0]
                    os.environ[key.strip()] = val
    except FileNotFoundError:
        return False
    return True

# Try loading .env from various locations
if not load_dotenv('.env'):
    load_dotenv('../../.env')

# --- Config ------------------------------------------------------

R2_ACCOUNT_ID = os.environ.get('R2_ACCOUNT_ID', '')
R2_ACCESS_KEY = os.environ.get('R2_ACCESS_KEY_ID', '')
R2_SECRET_KEY = os.environ.get('R2_SECRET_ACCESS_KEY', '')
R2_BUCKET = os.environ.get('R2_BUCKET_NAME', '')
R2_PUBLIC_URL = os.environ.get('R2_PUBLIC_URL', '')
VTONE_API_URL = os.environ.get('VTONE_API_URL', 'http://localhost:8000')

R2_ENDPOINT = f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com'

print(f"R2_ACCOUNT_ID: {'SET' if R2_ACCOUNT_ID else 'EMPTY'}")
print(f"R2_BUCKET:     {R2_BUCKET}")
print(f"R2_PUBLIC_URL: {R2_PUBLIC_URL}")
print(f"VTONE_API_URL: {VTONE_API_URL}")
print()


# --- Create test images ------------------------------------------

def create_test_images():
    """Create simple test garment and person images."""
    print("Creating test images...")

    # Garment: red t-shirt on white background (512x512)
    garment = Image.new('RGB', (512, 512), 'white')
    draw = ImageDraw.Draw(garment)
    draw.polygon([
        (156, 50), (356, 50), (400, 180), (380, 300),
        (360, 460), (260, 480), (152, 460), (132, 300), (112, 180)
    ], fill='#E74C3C', outline='#C0392B')

    buf = io.BytesIO()
    garment.save(buf, format='JPEG', quality=90)
    garment_bytes = buf.getvalue()
    print(f"  Garment image: {len(garment_bytes)} bytes")

    # Person: simple figure on light background (512x768)
    person = Image.new('RGB', (512, 768), '#F5F5F5')
    draw = ImageDraw.Draw(person)
    # Head
    draw.ellipse([200, 50, 312, 162], fill='#D2A679', outline='#A0785A')
    # Body/torso
    draw.polygon([
        (185, 200), (327, 200), (355, 480), (157, 480)
    ], fill='#4A90D9', outline='#2C6FBA')
    # Arms
    draw.rectangle([50, 220, 178, 340], fill='#D2A679', outline='#A0785A')
    draw.rectangle([334, 220, 462, 340], fill='#D2A679', outline='#A0785A')
    # Legs
    draw.rectangle([185, 500, 255, 700], fill='#34495E', outline='#2C3E50')
    draw.rectangle([257, 500, 327, 700], fill='#34495E', outline='#2C3E50')

    buf = io.BytesIO()
    person.save(buf, format='JPEG', quality=90)
    person_bytes = buf.getvalue()
    print(f"  Person image: {len(person_bytes)} bytes")

    return garment_bytes, person_bytes


# --- Upload to R2 ------------------------------------------------

def upload_to_r2(key, data, content_type):
    """Upload bytes to R2 and return public URL."""
    try:
        import boto3
        from botocore.config import Config

        s3 = boto3.client(
            's3',
            endpoint_url=R2_ENDPOINT,
            aws_access_key_id=R2_ACCESS_KEY,
            aws_secret_access_key=R2_SECRET_KEY,
            config=Config(signature_version='s3v4'),
            region_name='auto',
        )

        s3.put_object(
            Bucket=R2_BUCKET,
            Key=key,
            Body=data,
            ContentType=content_type,
            CacheControl='public, max-age=3600',
        )

        url = f"{R2_PUBLIC_URL}/{key}"
        print(f"  Uploaded: {url}")
        return url

    except Exception as e:
        print(f"  ERROR: R2 upload failed: {e}")
        return None


# --- V-Tone Test -------------------------------------------------

def test_vtone(person_url, garment_url):
    """Call V-Tone try-on API and return result."""
    print()
    print("--- Testing V-Tone Try-On ---")
    print(f"  Person URL:  {person_url}")
    print(f"  Garment URL: {garment_url}")

    # Health check first
    print()
    print("  Health check...")
    try:
        r = requests.get(f"{VTONE_API_URL}/health", timeout=10)
        health = r.json()
        print(f"    Status: {health['status']}")
        print(f"    Device: {health['device']}")
        print(f"    Pipeline loaded: {health['pipeline_loaded']}")
        if not health['pipeline_loaded']:
            print("    ERROR: Pipeline not loaded!")
            return None
    except Exception as e:
        print(f"    ERROR: Health check failed: {e}")
        return None

    # Run try-on
    print()
    print("  Running try-on (this may take 30-120s on CPU)...")
    t0 = time.time()

    try:
        r = requests.post(
            f"{VTONE_API_URL}/try-on",
            json={
                'person_image_url': person_url,
                'garment_image_url': garment_url,
                'category': 'tops',
            },
            timeout=180,
        )
        elapsed = time.time() - t0

        if r.status_code == 200:
            result = r.json()
            if result['status'] == 'completed':
                print(f"  SUCCESS: Try-on completed in {elapsed:.1f}s")
                print(f"  Result URL: {result['result_url'][:100]}...")
                print(f"  Latency: {result['latency_ms']}ms")

                # Download the result to verify
                print()
                print("  Downloading result image...")
                try:
                    img_r = requests.get(result['result_url'], timeout=30)
                    if img_r.status_code == 200:
                        output_path = f"tryon-result-{int(time.time())}.jpg"
                        with open(output_path, 'wb') as f:
                            f.write(img_r.content)
                        print(f"  Saved result to: {output_path} ({len(img_r.content)} bytes)")
                except Exception as e:
                    print(f"  Warning: Could not download result: {e}")

                return result
            else:
                print(f"  FAILED: {result.get('error', 'unknown error')}")
                return result
        else:
            print(f"  ERROR: HTTP {r.status_code}: {r.text[:200]}")
            return None

    except requests.Timeout:
        print(f"  ERROR: Request timed out after 180s")
        return None
    except Exception as e:
        print(f"  ERROR: {e}")
        return None


# --- Main --------------------------------------------------------

def main():
    print("========================================")
    print("  V-Tone Try-On Test Runner")
    print("========================================")
    print()

    if not R2_ACCOUNT_ID:
        print("ERROR: R2_ACCOUNT_ID not found in .env")
        print("Make sure .env exists in project root with R2 credentials.")
        sys.exit(1)

    # Step 1: Create test images
    print("--- Step 1: Create test images ---")
    garment_bytes, person_bytes = create_test_images()

    # Step 2: Upload to R2
    print()
    print("--- Step 2: Upload test images to R2 ---")
    ts = int(time.time())
    person_url = upload_to_r2(f"scratch-test-vtone/{ts}/person.jpg", person_bytes, 'image/jpeg')
    garment_url = upload_to_r2(f"scratch-test-vtone/{ts}/garment.jpg", garment_bytes, 'image/jpeg')

    if not person_url or not garment_url:
        print()
        print("ERROR: Failed to upload test images.")
        sys.exit(1)

    # Step 3: Test V-Tone
    print()
    print("--- Step 3: V-Tone try-on test ---")
    result = test_vtone(person_url, garment_url)

    print()
    if result and result.get('status') == 'completed':
        print("===========================================")
        print("  TEST PASSED! V-Tone is working!")
        print("===========================================")
    else:
        print("===========================================")
        print("  TEST ISSUES - check output above")
        print("===========================================")
    print()


if __name__ == '__main__':
    main()
