import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import vrmUrl from "../assets/model/kitasan.vrm?url";
import useLipSync from "../hooks/useLipSync";
import useNaturalBlink from "../hooks/useNaturalBlink";

const MOUTH_EXPRESSION = "aa";
const BLINK_EXPRESSION = "blink";

const collectExpressionMorphs = (vrm, expressionName) => {
  const expression = vrm.expressionManager?.getExpression(expressionName);
  const morphs = [];

  if (!expression) return morphs;

  for (const bind of expression.binds) {
    for (const target of bind.primitives ?? []) {
      if (target?.morphTargetInfluences && Number.isInteger(bind.index)) {
        morphs.push({ target, index: bind.index, weight: bind.weight ?? 1 });
      }
    }
  }

  return morphs;
};

const collectMorphsByIndex = (vrm, morphIndex) => {
  const morphs = [];

  vrm.scene.traverse((object) => {
    if (object.morphTargetInfluences?.[morphIndex] != null) {
      morphs.push({ target: object, index: morphIndex, weight: 1 });
    }
  });

  return morphs;
};

export default function VRMViewer() {
  const containerRef = useRef();
  const vrmRef = useRef();
  const audioRef = useRef();
  const mouthValueRef = useRef(0);
  const manualMouthValueRef = useRef(0);
  const mouthMorphsRef = useRef([]);
  const blinkMorphsRef = useRef([]);
  const [vrm, setVrm] = useState(null);
  const [audioSrc, setAudioSrc] = useState("");
  const [audioEl, setAudioEl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [manualMouthValue, setManualMouthValue] = useState(0);

  // Pass vrm and audio element to the hook — it handles lip-sync internally
  const { mouthValue } = useLipSync(vrm, audioEl);
  const { blinkWeightRef, updateBlink } = useNaturalBlink(vrm, mouthValue);

  useEffect(() => {
    mouthValueRef.current = mouthValue;
  }, [mouthValue]);

  useEffect(() => {
    manualMouthValueRef.current = manualMouthValue;
  }, [manualMouthValue]);

  useEffect(() => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    const container = containerRef.current;

    const camera = new THREE.PerspectiveCamera(
      35,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    camera.position.set(0, 1.4, 2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1, 1);
    scene.add(light);

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(vrmUrl, (gltf) => {
      const loadedVrm = gltf.userData.vrm;
      vrmRef.current = loadedVrm;
      mouthMorphsRef.current = collectExpressionMorphs(loadedVrm, MOUTH_EXPRESSION);
      blinkMorphsRef.current = collectExpressionMorphs(loadedVrm, BLINK_EXPRESSION);
      if (mouthMorphsRef.current.length === 0) {
        mouthMorphsRef.current = collectMorphsByIndex(loadedVrm, 36);
      }
      if (blinkMorphsRef.current.length === 0) {
        blinkMorphsRef.current = collectMorphsByIndex(loadedVrm, 14);
      }
      console.info("VRM expression morphs", {
        mouth: mouthMorphsRef.current.length,
        blink: blinkMorphsRef.current.length,
      });
      setVrm(loadedVrm);
      scene.add(loadedVrm.scene);
    });

    const clock = new THREE.Clock();

    let animationFrameId = null;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const currentVrm = vrmRef.current;
      if (currentVrm) {
        const elapsedTime = clock.elapsedTime;
        updateBlink(elapsedTime);
        const activeMouthValue = Math.max(
          mouthValueRef.current,
          manualMouthValueRef.current
        );
        currentVrm.expressionManager?.setValue(MOUTH_EXPRESSION, activeMouthValue);
        currentVrm.expressionManager?.setValue(BLINK_EXPRESSION, blinkWeightRef.current);
        currentVrm.update(clock.getDelta());
        for (const morph of mouthMorphsRef.current) {
          morph.target.morphTargetInfluences[morph.index] =
            activeMouthValue * morph.weight;
        }
        for (const morph of blinkMorphsRef.current) {
          morph.target.morphTargetInfluences[morph.index] =
            blinkWeightRef.current * morph.weight;
        }
      }

      // console.log(currentVrm);

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [blinkWeightRef, updateBlink]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAudioSrc(url);
    setIsPlaying(false);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !audioSrc) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
  };

  const buttonStyle = {
    position: "fixed",
    bottom: 20,
    padding: "8px 16px",
    fontSize: 14,
    borderRadius: 6,
    color: "#fff",
    cursor: "pointer",
    zIndex: 1000,
  };

  return (
    <>
      <div
        ref={containerRef}
        style={{
          width: "100vw",
          height: "100vh",
        }}
      />

      <audio
        ref={(el) => {
          audioRef.current = el;
          setAudioEl(el);
        }}
        src={audioSrc}
        onEnded={handleAudioEnded}
        style={{ display: "none" }}
      />

      {/* Audio file selector */}
      <label
        style={{
          ...buttonStyle,
          left: 20,
          background: "#333",
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        选择音频文件
        <input
          type="file"
          accept="audio/*"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
      </label>

      {/* Play/Pause button */}
      {audioSrc && (
        <button
          onClick={togglePlay}
          style={{
            ...buttonStyle,
            left: 160,
            background: isPlaying ? "#ff4444" : "#4CAF50",
          }}
        >
          {isPlaying ? "暂停" : "播放"}
        </button>
      )}

      {audioSrc && (
        <div
          style={{
            position: "fixed",
            left: 20,
            bottom: 70,
            width: 240,
            padding: "8px 10px",
            borderRadius: 6,
            background: "rgba(0, 0, 0, 0.65)",
            color: "#fff",
            fontSize: 12,
            zIndex: 1000,
            textAlign: "left",
          }}
        >
          嘴型: {mouthValue.toFixed(2)}
          <div
            style={{
              height: 6,
              marginTop: 6,
              borderRadius: 999,
              background: "rgba(255, 255, 255, 0.25)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${mouthValue * 100}%`,
                height: "100%",
                background: "#4CAF50",
              }}
            />
          </div>
        </div>
      )}

      <label
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          width: 220,
          padding: "8px 10px",
          borderRadius: 6,
          background: "rgba(0, 0, 0, 0.65)",
          color: "#fff",
          fontSize: 12,
          zIndex: 1000,
          textAlign: "left",
        }}
      >
        手动嘴型测试: {manualMouthValue.toFixed(2)}
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={manualMouthValue}
          onChange={(event) => setManualMouthValue(Number(event.target.value))}
          style={{ width: "100%" }}
        />
      </label>
    </>
  );
}
