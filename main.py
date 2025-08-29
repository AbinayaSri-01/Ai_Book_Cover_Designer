import os
import io
from fastapi import FastAPI, Query, Form, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from PIL import Image, ImageDraw, ImageFont
from google import genai
from google.genai import types
from dotenv import load_dotenv
import tempfile

# Load environment variables
load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Get API key from .env
api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    raise ValueError("Missing GOOGLE_API_KEY in environment or .env file")

# Gemini client
client = genai.Client(api_key=api_key)


def generate_book_cover_with_ai_images(width: int, height: int, spine_thickness: float = 0.5,
                                       front_image: Image.Image = None, back_image: Image.Image = None):
    """Generate a complete book cover with AI-generated front and back images."""

    # Convert spine thickness from inches to pixels (assuming 300 DPI)
    spine_pixels = int(spine_thickness * 300)

    # Calculate total width: back + spine + front
    front_back_width = width
    total_width = (front_back_width * 2) + spine_pixels

    # Create the full book cover image
    image = Image.new("RGB", (total_width, height), "white")
    draw = ImageDraw.Draw(image)

    # Define sections
    back_section = (0, 0, front_back_width, height)
    spine_section = (front_back_width, 0, front_back_width + spine_pixels, height)
    front_section = (front_back_width + spine_pixels, 0, total_width, height)

    # Back Cover
    if back_image:
        back_resized = back_image.resize((front_back_width, height), Image.Resampling.LANCZOS)
        image.paste(back_resized, (0, 0))
    else:
        draw.rectangle(back_section, fill="#E3F2FD", outline="#1976D2", width=2)

    # Spine
    draw.rectangle(spine_section, fill="black", outline="black", width=2)

    # Front Cover
    if front_image:
        front_resized = front_image.resize((front_back_width, height), Image.Resampling.LANCZOS)
        image.paste(front_resized, (front_back_width + spine_pixels, 0))
    else:
        draw.rectangle(front_section, fill="#E8F5E8", outline="#388E3C", width=2)

    # Spine text
    try:
        font_size = min(24, height // 30)
        font = ImageFont.load_default()
    except:
        font = ImageFont.load_default()

    spine_text = "SPINE"
    spine_bbox = draw.textbbox((0, 0), spine_text, font=font)
    spine_text_width = spine_bbox[2] - spine_bbox[0]
    spine_text_height = spine_bbox[3] - spine_bbox[1]

    if spine_pixels > spine_text_height:
        spine_x = front_back_width + (spine_pixels - spine_text_height) // 2
        spine_y = (height - spine_text_width) // 2
        temp_img = Image.new('RGBA', (spine_text_width, spine_text_height), (0, 0, 0, 0))
        temp_draw = ImageDraw.Draw(temp_img)
        temp_draw.text((0, 0), spine_text, fill="#FFFFFF", font=font)
        rotated = temp_img.rotate(90, expand=True)
        image.paste(rotated, (spine_x, spine_y), rotated)

    if not front_image and not back_image:
        info_text = f"{front_back_width}×{height} | Spine: {spine_thickness}\""
        info_bbox = draw.textbbox((0, 0), info_text, font=font)
        info_width = info_bbox[2] - info_bbox[0]
        info_x = (total_width - info_width) // 2
        info_y = height - 30
        draw.text((info_x, info_y), info_text, fill="#666666", font=font)

    return image


def generate_book_cover(width: int, height: int, spine_thickness: float = 0.5, preview=False):
    """Generate book cover and return as BytesIO buffer"""
    image = generate_book_cover_with_ai_images(width, height, spine_thickness)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    return buffer


def extract_cover_part(image: Image.Image, part_type: str, width: int, height: int, spine_thickness: float):
    """
    Extract specific part (front, back, or spine) from the full book cover image

    Args:
        image: PIL Image of the full book cover
        part_type: "front", "back", or "spine"
        width: Width of individual front/back cover
        height: Height of the cover
        spine_thickness: Spine thickness in inches (converted to pixels)

    Returns:
        PIL Image of the extracted part
    """

    # Convert spine thickness from inches to pixels (assuming 300 DPI)
    spine_width_px = int(spine_thickness * 300)

    # Calculate total expected width: back + spine + front
    expected_total_width = width + spine_width_px + width

    # If the image dimensions don't match expected layout, scale accordingly
    if image.width != expected_total_width:
        scale_factor = image.width / expected_total_width
        spine_width_px = int(spine_width_px * scale_factor)
        actual_section_width = int(width * scale_factor)
    else:
        actual_section_width = width

    if part_type == "front":
        # Extract front cover (right part)
        front_start_x = image.width - actual_section_width
        extracted = image.crop((front_start_x, 0, image.width, height))

    elif part_type == "back":
        # Extract back cover (left part)
        extracted = image.crop((0, 0, actual_section_width, height))

    elif part_type == "spine":
        # Extract spine (middle part)
        spine_start_x = actual_section_width
        spine_end_x = actual_section_width + spine_width_px
        extracted = image.crop((spine_start_x, 0, spine_end_x, height))

    else:
        raise ValueError(f"Invalid part_type: {part_type}")

    return extracted


def normalize_format(fmt: str):
    """Normalize format string for PIL"""
    fmt = fmt.lower()
    if fmt == "jpg":
        return "JPEG"
    if fmt == "pdf":
        return "PDF"
    return fmt.upper()


def create_download_response(image: Image.Image, format: str, filename: str):
    """Create a download response for the given image"""
    output_buffer = io.BytesIO()

    if format.lower() == "jpg":
        # Convert to RGB for JPEG (removes transparency)
        if image.mode in ("RGBA", "P"):
            image = image.convert("RGB")
        image.save(output_buffer, format="JPEG", quality=95)
        media_type = "image/jpeg"

    elif format.lower() == "pdf":
        image.save(output_buffer, format="PDF")
        media_type = "application/pdf"

    else:  # PNG (default)
        image.save(output_buffer, format="PNG")
        media_type = "image/png"

    output_buffer.seek(0)

    return StreamingResponse(
        io.BytesIO(output_buffer.read()),
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.get("/")
def root():
    buffer = generate_book_cover(600, 900)
    return StreamingResponse(buffer, media_type="image/png")


@app.get("/canvas")
def create_canvas(
        width: int = Query(600, description="Width of front/back cover"),
        height: int = Query(900, description="Height of book cover"),
        spine_thickness: float = Query(0.5, description="Spine thickness in inches")
):
    buffer = generate_book_cover(width, height, spine_thickness)
    return StreamingResponse(buffer, media_type="image/png")


@app.post("/generate-ai-cover/")
async def generate_ai_cover(
        width: int = Form(...),
        height: int = Form(...),
        spine_thickness: float = Form(...),
        front_prompt: str = Form(...),
        back_prompt: str = Form(...)
):
    try:
        front_image = None
        back_image = None

        if front_prompt.strip():
            response_front = client.models.generate_content(
                model="gemini-2.0-flash-preview-image-generation",
                contents=front_prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["TEXT", "IMAGE"]
                ),
            )
            for part in response_front.candidates[0].content.parts:
                if part.inline_data is not None:
                    image_bytes = part.inline_data.data
                    front_image = Image.open(io.BytesIO(image_bytes))
                    break

        if back_prompt.strip():
            response_back = client.models.generate_content(
                model="gemini-2.0-flash-preview-image-generation",
                contents=back_prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["TEXT", "IMAGE"]
                ),
            )
            for part in response_back.candidates[0].content.parts:
                if part.inline_data is not None:
                    image_bytes = part.inline_data.data
                    back_image = Image.open(io.BytesIO(image_bytes))
                    break

        image = generate_book_cover_with_ai_images(
            width=width,
            height=height,
            spine_thickness=spine_thickness,
            front_image=front_image,
            back_image=back_image
        )

        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        buffer.seek(0)

        return StreamingResponse(buffer, media_type="image/png")

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}


@app.post("/add-text/")
async def add_text_to_canvas(
        text: str = Form(...),
        x: int = Form(50),
        y: int = Form(50),
        font_size: int = Form(40),
        color: str = Form("#000000"),
        width: int = Form(600),
        height: int = Form(900)
):
    """
    API to overlay text on the canvas image.
    - text: The text to display
    - x, y: Position of text
    - font_size: Size of text
    - color: Hex color of text
    """
    try:
        # Start with a blank book cover
        buffer = generate_book_cover(width, height)

        # Load image back from buffer
        image = Image.open(buffer).convert("RGBA")
        draw = ImageDraw.Draw(image)

        # Use default PIL font (or load TTF for better quality)
        try:
            font = ImageFont.truetype("arial.ttf", font_size)
        except:
            font = ImageFont.load_default()

        # Draw the text
        draw.text((x, y), text, font=font, fill=color)

        # Save back to buffer
        out_buffer = io.BytesIO()
        image.save(out_buffer, format="PNG")
        out_buffer.seek(0)

        return StreamingResponse(out_buffer, media_type="image/png")

    except Exception as e:
        return {"error": str(e)}


@app.post("/download-front/")
async def download_front_cover(
        file: UploadFile = File(...),
        format: str = Form("png"),
        width: int = Form(...),
        height: int = Form(...),
        spine_thickness: float = Form(...),
        part_type: str = Form("front"),
        include_text: bool = Form(True)
):
    """Download front cover only (without spine)"""
    try:
        # Read the uploaded image
        image_data = await file.read()
        image = Image.open(io.BytesIO(image_data))

        # Extract only the front cover part
        front_cover = extract_cover_part(image, "front", width, height, spine_thickness)

        # Create download response
        filename = f"Front_Cover.{format}"
        return create_download_response(front_cover, format, filename)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing front cover: {str(e)}")


@app.post("/download-back/")
async def download_back_cover(
        file: UploadFile = File(...),
        format: str = Form("png"),
        width: int = Form(...),
        height: int = Form(...),
        spine_thickness: float = Form(...),
        part_type: str = Form("back"),
        include_text: bool = Form(True)
):
    """Download back cover only (without spine)"""
    try:
        # Read the uploaded image
        image_data = await file.read()
        image = Image.open(io.BytesIO(image_data))

        # Extract only the back cover part
        back_cover = extract_cover_part(image, "back", width, height, spine_thickness)

        # Create download response
        filename = f"Back_Cover.{format}"
        return create_download_response(back_cover, format, filename)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing back cover: {str(e)}")


@app.post("/download-spine/")
async def download_spine_cover(
        file: UploadFile = File(...),
        format: str = Form("png"),
        width: int = Form(...),
        height: int = Form(...),
        spine_thickness: float = Form(...),
        part_type: str = Form("spine"),
        include_text: bool = Form(True)
):
    """Download spine cover only"""
    try:
        # Read the uploaded image
        image_data = await file.read()
        image = Image.open(io.BytesIO(image_data))

        # Extract only the spine part
        spine_cover = extract_cover_part(image, "spine", width, height, spine_thickness)

        # Create download response
        filename = f"Spine_Cover.{format}"
        return create_download_response(spine_cover, format, filename)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing spine cover: {str(e)}")