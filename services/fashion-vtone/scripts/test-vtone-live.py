#!/usr/bin/env python3
"""
V-Tone Live Test: tests the try-on service running in Docker.

The V-Tone service runs inside a Docker container, so image URLs must
use host.docker.internal instead of localhost to reach the host machine.
"""

import os
import sys
import time
import io
import json
import threading
import http.server
import socketserver

import requests
from PIL import Image, ImageDraw

# --- Config --------------------------------------------------------

VTONE_API_URL = os.environ.get('VTONE_API_URL', 'http://localhost:8000')
TEST_IMAGE_PORT = 9898

# V-Tone runs in Docker, so use host.docker.internal (Windows/Mac)
# or the actual host IP to reach services running on the host.
HOSTNAME_FOR_DOCKER = 'host.docker.internal'

# --- Create test images --------------------------------------------

def create_test_images():
    """Create test garment and person images."""
    print("Creating test images...")

    # Garment: red t-shirt on white
    garment = Image.new('RGB', (512, 512), 'white')
    draw = ImageDraw.Draw(garment)
    draw.polygon([
        (156, 50), (356, 50), (400, 180), (380, 300),
        (360, 460), (260, 480), (152, 460), (132, 300), (112, 180)
    ], fill='#E74C3C', outline='#C0392B')
    buf = io.BytesIO()
    garment.save(buf, format='JPEG', quality=90)
    garment_bytes = buf.getvalue()

    # Person: simple figure on light background
    person = Image.new('RGB', (512, 768), '#F5F5F5')
    draw = ImageDraw.Draw(person)
    draw.ellipse([200, 50, 312, 162], fill='#D2A679', outline='#A0785A')
    draw.polygon([(185, 200), (327, 200), (355, 480), (157, 480)], fill='#4A90D9', outline='#2C6FBA')
    draw.rectangle([50, 220, 178, 340], fill='#D2A679', outline='#A0785A')
    draw.rectangle([334, 220, 462, 340], fill='#D2A679', outline='#A0785A')
    draw.rectangle([185, 500, 255, 700], fill='#34495E', outline='#2C3E50')
    draw.rectangle([257, 500, 327, 700], fill='#34495E', outline='#2C3E50')
    buf = io.BytesIO()
    person.save(buf, format='JPEG', quality=90)
    person_bytes = buf.getvalue()

    print(f"  Garment image: {len(garment_bytes)} bytes")
    print(f"  Person image:  {len(person_bytes)} bytes")
    return garment_bytes, person_bytes


# --- HTTP Server to serve test images ------------------------------

class TestImageHandler(http.server.SimpleHTTPRequestHandler):
    _garment = b''
    _person = b''

    def do_GET(self):
        if self.path == '/garment.jpg':
            self.send_response(200)
            self.send_header('Content-Type', 'image/jpeg')
            self.send_header('Content-Length', str(len(self._garment)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(self._garment)
        elif self.path == '/person.jpg':
            self.send_response(200)
            self.send_header('Content-Type', 'image/jpeg')
            self.send_header('Content-Length', str(len(self._person)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(self._person)
        else:
            content = json.dumps({
                'person': f'http://{HOSTNAME_FOR_DOCKER}:{TEST_IMAGE_PORT}/person.jpg',
                'garment': f'http://{HOSTNAME_FOR_DOCKER}:{TEST_IMAGE_PORT}/garment.jpg',
            }).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)

    def log_message(self, format, *args):
        pass  # Suppress logs


def start_image_server(garment_bytes, person_bytes):
    """Start a temporary HTTP server to serve test images."""
    TestImageHandler._garment = garment_bytes
    TestImageHandler._person = person_bytes

    server = socketserver.TCPServer(('0.0.0.0', TEST_IMAGE_PORT), TestImageHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"  Server started on http://0.0.0.0:{TEST_IMAGE_PORT}")
    time.sleep(0.3)
    return server


# --- Test V-Tone ---------------------------------------------------

def test_vtone():
    """Run the V-Tone try-on test."""
    print()
    print("=" * 60)
    print("  V-TONE TRY-ON TEST")
    print("=" * 60)
    print(f"  API: {VTONE_API_URL}")
    print(f"  (V-Tone runs in Docker, using {HOSTNAME_FOR_DOCKER} for host access)")

    # Step 1: Health check
    print()
    print("--- Step 1: Health Check ---")
    try:
        r = requests.get(f"{VTONE_API_URL}/health", timeout=10)
        health = r.json()
        print(f"  Status:          {health['status']}")
        print(f"  Pipeline loaded: {health['pipeline_loaded']}")
        print(f"  Device:          {health['device']}")

        if not health['pipeline_loaded']:
            print("  FAILED: Pipeline not loaded")
            return False
    except Exception as e:
        print(f"  FAILED: {e}")
        return False

    # Step 2: Create test images and start server
    print()
    print("--- Step 2: Prepare Test Images ---")
    garment_bytes, person_bytes = create_test_images()
    server = start_image_server(garment_bytes, person_bytes)

    # Use host.docker.internal so the Docker container can reach us
    person_url = f"http://{HOSTNAME_FOR_DOCKER}:{TEST_IMAGE_PORT}/person.jpg"
    garment_url = f"http://{HOSTNAME_FOR_DOCKER}:{TEST_IMAGE_PORT}/garment.jpg"
    print(f"  Person URL:  {person_url}")
    print(f"  Garment URL: {garment_url}")

    # Verify the server works on both localhost and host.docker.internal
    print()
    print("  Verifying image server...")
    for host in ['localhost', HOSTNAME_FOR_DOCKER]:
        try:
            r = requests.get(f"http://{host}:{TEST_IMAGE_PORT}/", timeout=5)
            print(f"  http://{host}:{TEST_IMAGE_PORT} -> OK")
        except Exception as e:
            print(f"  http://{host}:{TEST_IMAGE_PORT} -> {e}")

    # Step 3: Run try-on
    print()
    print("--- Step 3: Run Try-On ---")
    print("  This takes 30-120s on CPU. Please wait...")
    print()

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
        total_s = int(elapsed)

        if r.status_code == 200:
            result = r.json()
            if result['status'] == 'completed':
                result_url = result['result_url']

                print(f"  TIME: {total_s}s")
                print(f"  STATUS: COMPLETED")
                print(f"  LATENCY: {result['latency_ms']}ms")
                print(f"  RESULT URL: {result_url[:120]}...")

                # Download result
                print()
                print("--- Step 4: Download Result ---")
                try:
                    img_r = requests.get(result_url, timeout=30)
                    if img_r.status_code == 200:
                        output = f"tryon-result-{int(time.time())}.jpg"
                        with open(output, 'wb') as f:
                            f.write(img_r.content)
                        print(f"  Saved to: {os.path.abspath(output)}")
                        print(f"  Size: {len(img_r.content)} bytes")
                except Exception as e:
                    print(f"  Download warning: {e}")

                print()
                print("=" * 60)
                print("  TEST PASSED! V-Tone is working correctly.")
                print("=" * 60)
                return True
            else:
                print(f"  FAILED: {result.get('error', 'unknown')}")
                return False
        else:
            print(f"  ERROR: HTTP {r.status_code}")
            print(f"  {r.text[:500]}")
            return False

    except requests.Timeout:
        print(f"  FAILED: Request timed out after 180s")
        return False
    except Exception as e:
        print(f"  FAILED: {e}")
        return False
    finally:
        server.shutdown()


# --- Main ----------------------------------------------------------

if __name__ == '__main__':
    success = test_vtone()
    sys.exit(0 if success else 1)
