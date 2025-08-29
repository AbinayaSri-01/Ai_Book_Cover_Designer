import React, { useState } from "react";
import "./Sidebar.css";
import { FaTrash, FaPencilAlt } from "react-icons/fa";
import html2canvas from "html2canvas";

function Sidebar({ onCanvasGenerated, canvasUrl, onTextChange, coverRef, onLayersChange }) {
  const [dimension, setDimension] = useState("600x900");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [spineThickness, setSpineThickness] = useState("0.5");
  const [frontPrompt, setFrontPrompt] = useState("");
  const [backPrompt, setBackPrompt] = useState("");
  const [downloadFormat, setDownloadFormat] = useState("png");
  const [defaultText, setDefaultText] = useState("");
  const [layers, setLayers] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [popupMessage, setPopupMessage] = useState("");
  const [popupType, setPopupType] = useState("success");
  const [showPopup, setShowPopup] = useState(false);
  const MAX_CHARS = 5000;

  const isFormValid = () => {
    if (!spineThickness.trim()) return false;
    if (!frontPrompt.trim()) return false;
    if (!backPrompt.trim()) return false;
    if (!defaultText.trim()) return false;
    if (dimension === "custom" && (!width || !height)) return false;
    return true;
  };

  const isDownloadEnabled = () => canvasUrl !== null;

  const handleAddLayer = () => {
    const newLayers = [...layers, ""];
    setLayers(newLayers);
    if (onLayersChange) onLayersChange(newLayers);
  };

  const handleLayerChange = (index, value) => {
    const updatedLayers = [...layers];
    updatedLayers[index] = value;
    setLayers(updatedLayers);
    if (onLayersChange) onLayersChange(updatedLayers);
  };

  const handleDeleteLayer = (index) => {
    const newLayers = layers.filter((_, i) => i !== index);
    setLayers(newLayers);
    if (onLayersChange) onLayersChange(newLayers);
  };

  const handleEditLayer = (index) => {
    const input = document.getElementById(`layer-${index}`);
    if (input) input.focus();
  };

  const handleDimensionChange = (e) => {
    const value = e.target.value;
    setDimension(value);
    if (value !== "custom") {
      setWidth("");
      setHeight("");
    }
  };

  const getCurrentDimensions = () => {
    let w, h;
    if (dimension === "custom" && width > 0 && height > 0) {
      w = parseInt(width);
      h = parseInt(height);
    } else {
      [w, h] = dimension.split("x").map(Number);
    }
    return { w, h };
  };

  const showMessage = (message, type = "success") => {
    setPopupMessage(message);
    setPopupType(type);
    setShowPopup(true);
    setTimeout(() => setShowPopup(false), 5000);
  };

  const handleSetDimensions = async () => {
    const { w, h } = getCurrentDimensions();
    const spine = parseFloat(spineThickness) || 0.5;

    try {
      const res = await fetch(
        `http://127.0.0.1:8000/canvas?width=${w}&height=${h}&spine_thickness=${spine}`
      );

      if (!res.ok) throw new Error(`Backend error: ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      if (onCanvasGenerated) onCanvasGenerated(url);
    } catch (err) {
      console.error("Could not connect to backend:", err);
      alert("Could not connect to backend. Please check if FastAPI is running.");
    }
  };

  const handleInternalTextChange = async (value) => {
    setDefaultText(value);
    if (!value.trim()) return;

    const { w, h } = getCurrentDimensions();

    try {
      const formData = new FormData();
      formData.append("text", value);
      formData.append("x", "100");
      formData.append("y", "150");
      formData.append("font_size", "48");
      formData.append("color", "#000000");
      formData.append("width", w.toString());
      formData.append("height", h.toString());

      const res = await fetch("http://127.0.0.1:8000/add-text/", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Backend error while adding text");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      if (onCanvasGenerated) onCanvasGenerated(url);
    } catch (err) {
      console.error("Error adding text:", err);
    }
  };

  const handleDownload = async () => {
    if (!isDownloadEnabled()) {
      alert("Please generate a book cover first before downloading.");
      return;
    }

    try {
      setIsGenerating(true);

      let canvasWithText = canvasUrl;

      if (coverRef && coverRef.current) {
        const canvas = await html2canvas(coverRef.current, {
          backgroundColor: null,
          scale: 2,
          logging: false,
          useCORS: true,
        });

        const blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/png")
        );
        canvasWithText = URL.createObjectURL(blob);
      }

      const { w, h } = getCurrentDimensions();
      const spine = parseFloat(spineThickness) || 0.5;

      const response = await fetch(canvasWithText);
      const imageBlob = await response.blob();

      const parts = [
        { endpoint: "front", name: "Front_Cover" },
        { endpoint: "back", name: "Back_Cover" },
        { endpoint: "spine", name: "Spine_Cover" },
      ];

      let downloadCount = 0;

      for (const part of parts) {
        try {
          const partFormData = new FormData();
          partFormData.append("file", imageBlob, "cover_with_text.png");
          partFormData.append("format", downloadFormat);
          partFormData.append("width", w.toString());
          partFormData.append("height", h.toString());
          partFormData.append("spine_thickness", spine.toString());
          partFormData.append("part_type", part.endpoint);
          partFormData.append("include_text", "true");

          const res = await fetch(
            `http://127.0.0.1:8000/download-${part.endpoint}/`,
            {
              method: "POST",
              body: partFormData,
            }
          );

          if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Download failed for ${part.endpoint}: ${errorText}`);
          }

          const fileBlob = await res.blob();
          const fileURL = URL.createObjectURL(fileBlob);

          const a = document.createElement("a");
          a.href = fileURL;
          const ext = downloadFormat === "jpg" ? "jpg" : downloadFormat;
          a.download = `${part.name}.${ext}`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(fileURL);

          downloadCount++;
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (partError) {
          console.error(`Error downloading ${part.endpoint}:`, partError);
        }
      }

      if (downloadCount > 0) {
        showMessage("Downloaded successfully!", "success");
      } else {
        showMessage("No files were downloaded.", "error");
      }

      if (canvasWithText !== canvasUrl) {
        URL.revokeObjectURL(canvasWithText);
      }
    } catch (err) {
      console.error("Download error:", err);
      showMessage("Failed to download files.", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateDesign = async () => {
    if (!isFormValid()) {
      showMessage("Please fill all mandatory fields before generating.", "error");
      return;
    }

    setIsGenerating(true);
    const { w, h } = getCurrentDimensions();
    const spine = parseFloat(spineThickness) || 0.5;

    try {
      const formData = new FormData();
      formData.append("width", w.toString());
      formData.append("height", h.toString());
      formData.append("spine_thickness", spine.toString());
      formData.append("front_prompt", frontPrompt);
      formData.append("back_prompt", backPrompt);

      const response = await fetch("http://127.0.0.1:8000/generate-ai-cover/", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error("AI Generation failed: " + (errorData.error || response.status));
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      if (onCanvasGenerated) onCanvasGenerated(url);
      showMessage("AI Book Cover Generated Successfully!", "success");
    } catch (error) {
      console.error("AI Generation Error:", error);
      showMessage(`AI Generation Failed: ${error.message}`, "error");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="sidebar">
      <h2>Book Cover Settings</h2>

      {/* Dimensions */}
      <div className="section">
        <p><strong>1. Dimensions</strong></p>
        <h4>Front & Back Cover</h4>
        <select value={dimension} onChange={handleDimensionChange}>
          <option value="600x900">600 x 900 (Default)</option>
          <option value="1200x1600">1200 x 1600</option>
          <option value="1600x2400">1600 x 2400</option>
          <option value="1920x1080">1920 x 1080</option>
          <option value="custom">Custom</option>
        </select>

        {dimension === "custom" && (
          <div className="custom-dimensions">
            <input
              type="number"
              placeholder="Width (px)"
              value={width}
              min="1"
              onChange={(e) => setWidth(e.target.value)}
              required
            />
            <input
              type="number"
              placeholder="Height (px)"
              value={height}
              min="1"
              onChange={(e) => setHeight(e.target.value)}
              required
            />
          </div>
        )}
      </div>

      {/* Spine Thickness */}
      <div className="section">
        <label className="mandatory">
          Spine Thickness <span style={{ color: "red" }}>*</span>
        </label>
        <input
          type="number"
          placeholder="Enter spine thickness (in inches)"
          value={spineThickness}
          min="0.1"
          max="3.0"
          step="0.1"
          onChange={(e) => setSpineThickness(e.target.value)}
          required
        />
        <button onClick={handleSetDimensions} style={{ marginTop: "10px", width: "100%" }}>
          Set Dimension
        </button>
      </div>

      {/* Prompts */}
      <p><strong>2. Design Prompt</strong></p>
      <div className="section">
        <label className="mandatory">
          Front Cover AI Prompt <span style={{ color: "red" }}>*</span>
        </label>
        <input
          type="text"
          placeholder="Enter AI prompt for Front Cover..."
          value={frontPrompt}
          onChange={(e) => setFrontPrompt(e.target.value)}
          maxLength={MAX_CHARS}
          required
        />
        <small>{frontPrompt.length}/{MAX_CHARS}</small>
      </div>

      <div className="section">
        <label className="mandatory">
          Back Cover AI Prompt <span style={{ color: "red" }}>*</span>
        </label>
        <input
          type="text"
          placeholder="Enter AI prompt for Back Cover..."
          value={backPrompt}
          onChange={(e) => setBackPrompt(e.target.value)}
          maxLength={MAX_CHARS}
          required
        />
        <small>{backPrompt.length}/{MAX_CHARS}</small>
      </div>

      {/* Text Layers */}
      <div className="section">
        <label className="mandatory">
          3. Text Layers <span style={{ color: "red" }}>*</span>
        </label>
        <div className="text-layer">
          <input
            id="layer-default"
            type="text"
            placeholder="Enter main text here..."
            value={defaultText}
            onChange={(e) => {
              const newValue = e.target.value;
              setDefaultText(newValue);
              if (onTextChange) onTextChange(newValue);
              handleInternalTextChange(newValue);
            }}
            required
          />
        </div>

        {layers.map((layer, index) => (
          <div key={index} className="text-layer">
            <input
              id={`layer-${index}`}
              type="text"
              placeholder={`Text Layer ${index + 1}`}
              value={layer}
              onChange={(e) => handleLayerChange(index, e.target.value)}
            />
            <span className="icons">
              <FaPencilAlt onClick={() => handleEditLayer(index)} />
              <FaTrash onClick={() => handleDeleteLayer(index)} />
            </span>
          </div>
        ))}

        <button className="add-layer-btn" onClick={handleAddLayer}>
          + Add Text
        </button>
      </div>

      {/* Generate */}
      <button
        onClick={handleGenerateDesign}
        disabled={isGenerating || !isFormValid()}
        style={{
          width: "100%",
          marginBottom: "10px",
          opacity: (isGenerating || !isFormValid()) ? 0.6 : 1,
          cursor: (isGenerating || !isFormValid()) ? "not-allowed" : "pointer",
          backgroundColor: isGenerating ? "#ff9800" : "#4CAF50",
        }}
      >
        {isGenerating ? "Generating AI Design..." : "Generate Design"}
      </button>

      {/* Download */}
      <div className="section">
        <p><strong>4. Set Format</strong></p>
        <select
          value={downloadFormat}
          onChange={(e) => setDownloadFormat(e.target.value)}
        >
          <option value="png">PNG</option>
          <option value="jpg">JPG</option>
          <option value="pdf">PDF</option>
        </select>
        <button
          className="download-btn"
          disabled={!isDownloadEnabled()}
          onClick={handleDownload}
          style={{
            opacity: isDownloadEnabled() ? 1 : 0.5,
            cursor: isDownloadEnabled() ? "pointer" : "not-allowed",
          }}
        >
          Download
        </button>
      </div>

      {/* Popup */}
      {showPopup && (
        <div
          className={`popup ${popupType}`}
          style={{
            position: "fixed",
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "16px 24px",
            borderRadius: "10px",
            color: "#fff",
            backgroundColor: popupType === "success" ? "#4CAF50" : "#f44336",
            boxShadow: "0px 6px 16px rgba(0,0,0,0.3)",
            zIndex: 9999,
            fontSize: "16px",
            textAlign: "center",
            animation:
              "slideDown 0.5s ease-out, slideUp 0.5s ease-in 4.5s forwards",
          }}
        >
          {popupMessage}
        </div>
      )}
    </div>
  );
}

export default Sidebar;