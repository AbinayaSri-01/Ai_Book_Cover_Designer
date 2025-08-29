                    import os
                    import io
                    from fastapi import FastAPI, Form, UploadFile, File, HTTPException
                    from fastapi.middleware.cors import CORSMiddleware
                    from fastapi.responses import StreamingResponse
                    from PIL import Image, ImageDraw, ImageFont
                    from google import genai
                    from google.genai import types
                    from dotenv import load_dotenv

                    # Load environment variables
                    load_dotenv()

                    app = FastAPI()

                    app.add_middleware(
                        CORSMiddleware,
                        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
                        allow_credentials=True,
                        allow_methods=["*"],
                        allow_headers=["*"],
                    )

                    # Google Gemini client
                    api_key = os.getenv("GOOGLE_API_KEY")
                    if not api_key:
                        raise ValueError("Missing GOOGLE_API_KEY in environment or .env file")
                    client = genai.Client(api_key=api_key)


                    def generate_book_cover_with_ai_images(width, height, spine_thickness=0.5,
                                                           front_image: Image.Image = None,
                                                           back_image: Image.Image = None):
                        """Generates the complete book cover"""
                        spine_pixels = int(spine_thickness * 300)

                        total_width = width * 2 + spine_pixels
                        image = Image.new("RGB", (total_width, height), "white")
                        draw = ImageDraw.Draw(image)

                        # Back cover
                        if back_image:
                            image.paste(back_image.resize((width, height)), (0, 0))
                        else:
                            draw.rectangle((0, 0, width, height), fill="#E3F2FD", outline="#1976D2", width=2)

                        # Spine
                        draw.rectangle((width, 0, width + spine_pixels, height), fill="black")

                        # Front cover
                        if front_image:
                            image.paste(front_image.resize((width, height)), (width + spine_pixels, 0))
                        else:
                            draw.rectangle((width + spine_pixels, 0, total_width, height), fill="#E8F5E8", outline="#388E3C", width=2)

                        return image


                    def extract_cover_part(image: Image.Image, part_type: str, width: int, height: int, spine_thickness: float):
                        """Extract front, back, or spine part without including spine"""
                        spine_px = int(spine_thickness * 300)

                        if part_type == "front":
                            left = width + spine_px
                            right = width + spine_px + width  # Front width only
                            return image.crop((left, 0, right, height))
                        elif part_type == "back":
                            left = 0
                            right = width  # Back width only
                            return image.crop((left, 0, right, height))
                        elif part_type == "spine":
                            left = width
                            right = width + spine_px
                            return image.crop((left, 0, right, height))
                        else:
                            raise ValueError(f"Invalid part_type: {part_type}")





                    def create_download_response(image: Image.Image, format: str, filename: str):
                        """Return image as downloadable file"""
                        buffer = io.BytesIO()
                        format = format.upper()
                        if format == "JPG":
                            if image.mode in ("RGBA", "P"):
                                image = image.convert("RGB")
                            image.save(buffer, format="JPEG")
                            media_type = "image/jpeg"
                        elif format == "PDF":
                            image.save(buffer, format="PDF")
                            media_type = "application/pdf"
                        else:
                            image.save(buffer, format="PNG")
                            media_type = "image/png"
                        buffer.seek(0)
                        return StreamingResponse(buffer, media_type=media_type, headers={"Content-Disposition": f"attachment; filename={filename}"})


                    @app.post("/generate-cover/")
                    async def generate_cover(
                            width: int = Form(...),
                            height: int = Form(...),
                            spine_thickness: float = Form(...),
                            front_prompt: str = Form(""),
                            back_prompt: str = Form("")
                    ):
                        """Generate AI cover or blank cover"""
                        try:
                            front_image = back_image = None

                            if front_prompt.strip():
                                response_front = client.models.generate_content(
                                    model="gemini-2.0-flash-preview-image-generation",
                                    contents=front_prompt,
                                    config=types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"])
                                )
                                for part in response_front.candidates[0].content.parts:
                                    if part.inline_data:
                                        front_image = Image.open(io.BytesIO(part.inline_data.data))
                                        break

                            if back_prompt.strip():
                                response_back = client.models.generate_content(
                                    model="gemini-2.0-flash-preview-image-generation",
                                    contents=back_prompt,
                                    config=types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"])
                                )
                                for part in response_back.candidates[0].content.parts:
                                    if part.inline_data:
                                        back_image = Image.open(io.BytesIO(part.inline_data.data))
                                        break

                            cover = generate_book_cover_with_ai_images(width, height, spine_thickness, front_image, back_image)
                            return create_download_response(cover, "png", "Full_Cover.png")
                        except Exception as e:
                            raise HTTPException(status_code=500, detail=f"Cover generation failed: {str(e)}")


                    @app.post("/download-part/")
                    async def download_part(
                            file: UploadFile = File(...),
                            width: int = Form(...),
                            height: int = Form(...),
                            spine_thickness: float = Form(...),
                            format: str = Form("png"),
                            part_type: str = Form("front")
                    ):
                        """Download specific part of a full cover with proper spine handling"""
                        try:
                            contents = await file.read()
                            image = Image.open(io.BytesIO(contents))

                            # Validate dimensions
                            total_width_expected = width * 2 + int(spine_thickness * 300)
                            if image.width != total_width_expected or image.height != height:
                                raise HTTPException(
                                    status_code=400,
                                    detail=f"Image dimensions do not match expected cover size. "
                                           f"Expected {total_width_expected}x{height}, got {image.width}x{image.height}"
                                )

                            part = extract_cover_part(image, part_type, width, height, spine_thickness)
                            return create_download_response(part, format, f"{part_type.capitalize()}_Cover.{format}")
                        except HTTPException:
                            raise
                        except Exception as e:
                            raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")
