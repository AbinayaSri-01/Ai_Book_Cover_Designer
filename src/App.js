import React, { useState, useRef } from "react";
import Sidebar from "./components/Sidebar";
import Moveable from "react-moveable";

function App() {
  const [canvasUrl, setCanvasUrl] = useState(null);
  const [defaultText, setDefaultText] = useState("");
  const [layers, setLayers] = useState([]);
  const [target, setTarget] = useState(null);

  const textRef = useRef(null);
  const coverRef = useRef(null);
  const layerRefs = useRef([]);

  const handleCanvasGenerated = (url) => {
    setCanvasUrl(url);
  };

  const handleLayersChange = (newLayers) => {
    setLayers(newLayers);
    layerRefs.current = layerRefs.current.slice(0, newLayers.length);
    while (layerRefs.current.length < newLayers.length) {
      layerRefs.current.push(React.createRef());
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Sidebar */}
      <div style={{ width: "300px", overflowY: "auto" }}>
        <Sidebar
          onCanvasGenerated={handleCanvasGenerated}
          canvasUrl={canvasUrl}
          onTextChange={setDefaultText}
          coverRef={coverRef}
          onLayersChange={handleLayersChange}
        />
      </div>

      {/* Main Content */}
      <div
        style={{
          flex: 1,
          padding: "20px",
          textAlign: "center",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setTarget(null);
        }}
      >
        <h1>Book Cover Designer</h1>

        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {canvasUrl ? (
            <div
              ref={coverRef}
              style={{
                position: "relative",
                display: "inline-block",
                maxWidth: "100%",
                maxHeight: "100%",
              }}
            >
              <img
                src={canvasUrl}
                alt="Generated Book Cover"
                style={{
                  border: "2px solid #ccc",
                  borderRadius: "8px",
                  maxWidth: "100%",
                  maxHeight: "calc(100vh - 200px)",
                  objectFit: "contain",
                  boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
                  display: "block",
                }}
              />

              {/* Main Text */}
              {defaultText && (
                <div
                  ref={textRef}
                  onClick={() => setTarget(textRef.current)}
                  style={{
                    position: "absolute",
                    top: "150px",
                    left: "100px",
                    fontSize: "48px",
                    color: "white",
                    fontWeight: "bold",
                    textShadow: "2px 2px 5px rgba(0,0,0,0.7)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    display: "inline-block",
                    userSelect: "none",
                    padding: "5px",
                    border:
                      target === textRef.current
                        ? "2px dashed #00ff00"
                        : "2px solid transparent",
                    borderRadius: "4px",
                    minWidth: "50px",
                    minHeight: "30px",
                  }}
                >
                  {defaultText}
                </div>
              )}

              {/* Additional Text Layers */}
              {layers.map((text, index) => {
                if (!text.trim()) return null;

                return (
                  <div
                    key={index}
                    ref={(el) => {
                      if (layerRefs.current[index]) {
                        layerRefs.current[index].current = el;
                      }
                    }}
                    onClick={() => {
                      if (layerRefs.current[index]) {
                        setTarget(layerRefs.current[index].current);
                      }
                    }}
                    style={{
                      position: "absolute",
                      top: 200 + index * 60 + "px",
                      left: "100px",
                      fontSize: "36px",
                      color: "white",
                      fontWeight: "bold",
                      textShadow: "2px 2px 5px rgba(0,0,0,0.7)",
                      whiteSpace: "nowrap",
                      userSelect: "none",
                      cursor: "pointer",
                      padding: "5px",
                      border:
                        layerRefs.current[index] &&
                        target === layerRefs.current[index].current
                          ? "2px dashed #00ff00"
                          : "2px solid transparent",
                      borderRadius: "4px",
                      minWidth: "50px",
                      minHeight: "30px",
                    }}
                  >
                    {text}
                  </div>
                );
              })}

              {/* Moveable */}
              {target && (
                <Moveable
                  target={target}
                  container={null}
                  origin={false}
                  draggable
                  resizable
                  rotatable
                  scalable
                  keepRatio={false}
                  throttleDrag={0}
                  throttleResize={0}
                  throttleRotate={0}
                  throttleScale={0}
                  snappable
                  snapThreshold={5}
                  snapGridWidth={10}
                  snapGridHeight={10}
                  renderDirections={["nw", "n", "ne", "w", "e", "sw", "s", "se"]}
                  onDrag={({ target, left, top }) => {
                    target.style.left = `${left}px`;
                    target.style.top = `${top}px`;
                  }}
                  onDragEnd={() => setTimeout(() => setTarget(null), 100)}
                  onResize={({ target, width, height }) => {
                    target.style.width = `${width}px`;
                    target.style.height = `${height}px`;
                    const newFontSize = Math.max(12, Math.min(100, width / 8));
                    target.style.fontSize = `${newFontSize}px`;
                    target.style.lineHeight = "1.2";
                  }}
                  onResizeEnd={() => setTimeout(() => setTarget(null), 100)}
                  onScale={({ target, scale }) => {
                    const currentTransform = target.style.transform || "";
                    target.style.transform = `${currentTransform.replace(
                      /scale\([^)]*\)/g,
                      ""
                    )} scale(${scale[0]}, ${scale[1]})`;
                  }}
                  onScaleEnd={() => setTimeout(() => setTarget(null), 100)}
                  onRotate={({ target, rotate }) => {
                    const currentTransform = target.style.transform || "";
                    target.style.transform = `${currentTransform.replace(
                      /rotate\([^)]*\)/g,
                      ""
                    )} rotate(${rotate}deg)`;
                  }}
                  onRotateEnd={() => setTimeout(() => setTarget(null), 100)}
                  onRenderStart={(e) => (e.target.style.outline = "2px solid #00ff00")}
                  onRenderEnd={(e) => (e.target.style.outline = "none")}
                />
              )}
            </div>
          ) : (
            <div style={{ textAlign: "center" }}>
              <p>No cover generated yet</p>
              <p style={{ fontSize: "14px", color: "#666" }}>
                Use the sidebar to set dimensions and generate a book cover
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
