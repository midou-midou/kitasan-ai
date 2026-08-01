import { useEffect, useRef, useState } from "react";
import vrmUrl from "../assets/model/kitasan.vrm?url";
import useLipSync from "../hooks/useLipSync";
import useNaturalBlink from "../hooks/useNaturalBlink";
import {
  createVRMAActionSystem,
  createVRMExpressionController,
  VRM_EXPRESSION_CONFIG,
  VRM_EXPRESSION_GROUPS,
} from "../animation";
import DebugControls from "./debug/DebugControls";
import { createVRMScene } from "../three/vrmScene";

/**
 * 收集指定 VRM 表情绑定到的 morph target。
 *
 * @param {object} vrm 已加载的 VRM 实例。
 * @param {string} expressionName 表情名称。
 * @returns {Array<{target: object, index: number, weight: number}>} 表情对应的 morph target 列表。
 */
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

/**
 * 按 morph target 索引从 VRM 场景中收集可控制对象。
 *
 * @param {object} vrm 已加载的 VRM 实例。
 * @param {number} morphIndex morph target 索引。
 * @returns {Array<{target: object, index: number, weight: number}>} 匹配索引的 morph target 列表。
 */
const collectMorphsByIndex = (vrm, morphIndex) => {
  const morphs = [];

  vrm.scene.traverse((object) => {
    if (object.morphTargetInfluences?.[morphIndex] != null) {
      morphs.push({ target: object, index: morphIndex, weight: 1 });
    }
  });

  return morphs;
};

/**
 * 初始化刚加载完成的 VRM 实例。
 *
 * @param {object} loadedVrm 已加载的 VRM 实例。
 * @param {{
 *   current: object|null
 * }} vrmRef VRM 引用。
 * @param {{current: Array<{target: object, index: number, weight: number}>}} mouthMorphsRef 嘴部 morph 引用。
 * @param {{current: Array<{target: object, index: number, weight: number}>}} blinkMorphsRef 眼部 morph 引用。
 * @param {{current: object|null}} vrmaControllerRef 动作控制器引用。
 * @param {{current: object|null}} expressionControllerRef 表情控制器引用。
 * @param {Function} setVrm React 状态设置函数。
 * @returns {void}
 */
const initializeLoadedVrm = (
  loadedVrm,
  vrmRef,
  mouthMorphsRef,
  blinkMorphsRef,
  vrmaControllerRef,
  expressionControllerRef,
  setVrm
) => {
  vrmRef.current?.scene?.parent?.remove(vrmRef.current.scene);
  vrmRef.current = null;
  mouthMorphsRef.current = [];
  blinkMorphsRef.current = [];

  vrmRef.current = loadedVrm;
  mouthMorphsRef.current = collectExpressionMorphs(loadedVrm, VRM_EXPRESSION_CONFIG.mouth);
  blinkMorphsRef.current = collectExpressionMorphs(loadedVrm, VRM_EXPRESSION_CONFIG.eye);

  if (mouthMorphsRef.current.length === 0) {
    mouthMorphsRef.current = collectMorphsByIndex(loadedVrm, 36);
  }
  if (blinkMorphsRef.current.length === 0) {
    blinkMorphsRef.current = collectMorphsByIndex(loadedVrm, 14);
  }

  vrmaControllerRef.current?.dispose();
  vrmaControllerRef.current = createVRMAActionSystem(loadedVrm);
  vrmaControllerRef.current.startIdle();

  expressionControllerRef.current?.dispose();
  expressionControllerRef.current = createVRMExpressionController(loadedVrm, {
    groups: VRM_EXPRESSION_GROUPS,
  });

  setVrm(loadedVrm);
};

/**
 * VRM 模型查看器组件。
 *
 * @returns {import("react").JSX.Element} VRM 模型渲染画布和调试控件。
 */
export default function VRMViewer() {
  const containerRef = useRef();
  const vrmRef = useRef();
  const mouthValueRef = useRef(0);
  const mouthMorphsRef = useRef([]);
  const blinkMorphsRef = useRef([]);
  const vrmaControllerRef = useRef(null);
  const expressionControllerRef = useRef(null);
  const [vrm, setVrm] = useState(null);
  const [audioEl, setAudioEl] = useState(null);

  const { mouthValue } = useLipSync(vrm, audioEl);
  const { blinkWeightRef, updateBlink } = useNaturalBlink(vrm, mouthValue);

  useEffect(() => {
    mouthValueRef.current = mouthValue;
    vrmaControllerRef.current?.setAudioLevel(mouthValue);
  }, [mouthValue]);

  useEffect(() => {
    const container = containerRef.current;
    const vrmScene = createVRMScene(container, vrmUrl);
    let isDisposed = false;
    const handleModelLoad = async () => {
      const loadedVrm = await vrmScene.loadModel();
      if (isDisposed || !loadedVrm) return;

      initializeLoadedVrm(
        loadedVrm,
        vrmRef,
        mouthMorphsRef,
        blinkMorphsRef,
        vrmaControllerRef,
        expressionControllerRef,
        setVrm
      );
    };

    handleModelLoad();

    let animationFrameId = null;

    /**
     * 执行每帧渲染、VRM 更新、眨眼更新和动画混合器更新。
     *
     * @returns {void}
     */
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const currentVrm = vrmRef.current;
      if (currentVrm) {
        const elapsedTime = vrmScene.getElapsedTime();
        const delta = vrmScene.getDelta();
        updateBlink(elapsedTime);
        vrmaControllerRef.current?.update(delta);

        const activeMouthValue = mouthValueRef.current;
        expressionControllerRef.current?.setMouthValue(
          VRM_EXPRESSION_CONFIG.mouth,
          activeMouthValue
        );
        expressionControllerRef.current?.setEyeValue(VRM_EXPRESSION_CONFIG.eye, blinkWeightRef.current);
        currentVrm.update(delta);
        for (const morph of mouthMorphsRef.current) {
          morph.target.morphTargetInfluences[morph.index] =
            activeMouthValue * morph.weight;
        }
        for (const morph of blinkMorphsRef.current) {
          morph.target.morphTargetInfluences[morph.index] =
            blinkWeightRef.current * morph.weight;
        }
      }

      vrmScene.render();
    };

    animate();

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      isDisposed = true;
      vrmRef.current?.scene?.parent?.remove(vrmRef.current.scene);
      vrmRef.current = null;
      mouthMorphsRef.current = [];
      blinkMorphsRef.current = [];
      vrmaControllerRef.current?.dispose();
      vrmaControllerRef.current = null;
      expressionControllerRef.current?.dispose();
      expressionControllerRef.current = null;
      vrmScene.dispose();
    };
  }, [blinkWeightRef, updateBlink]);

  return (
    <>
      <div
        ref={containerRef}
        style={{
          width: "100vw",
          height: "100vh",
        }}
      />

      {import.meta.env.DEV && (
        <DebugControls
          mouthValue={mouthValue}
          vrm={vrm}
          vrmaControllerRef={vrmaControllerRef}
          onAudioElementChange={setAudioEl}
        />
      )}

    </>
  );
}
