import { useEffect, useRef, useState } from "react";
import { VRMA_ACTIONS } from "../../animation";

/**
 * DebugControls 组件属性。
 *
 * @typedef {object} DebugControlsProps
 * @property {number} mouthValue 当前嘴型权重。
 * @property {object|null} vrm 当前 VRM 实例。
 * @property {{current: object|null}} vrmaControllerRef VRMA 控制器引用。
 * @property {Function} onAudioElementChange 音频元素变更回调。
 */

const panelStyle = {
  position: "fixed",
  left: 20,
  top: 20,
  bottom: 20,
  width: 200,
  padding: "8px 10px 8px 0",
  overflowY: "auto",
  overflowX: "hidden",
  scrollbarWidth: "none",
  background: "transparent",
  zIndex: 1000,
};

const controlsStackStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: 8,
  width: 180,
};

const buttonStyle = {
  width: "100%",
  padding: "8px 16px",
  fontSize: 14,
  border: 0,
  borderRadius: 6,
  color: "#fff",
  cursor: "pointer",
};

const meterStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 6,
  background: "rgba(0, 0, 0, 0.65)",
  color: "#fff",
  fontSize: 12,
  textAlign: "left",
  boxSizing: "border-box",
};

const actionButtonColors = [
  "#ff9800",
  "#2196F3",
  "#9C27B0",
  "#607D8B",
  "#795548",
  "#3F51B5",
  "#009688",
  "#E91E63",
];

/**
 * 开发环境下的 VRM 调试控件。
 *
 * @param {DebugControlsProps} props 组件属性。
 * @returns {import("react").JSX.Element} 调试控件面板。
 */
export default function DebugControls({
  mouthValue,
  vrm,
  vrmaControllerRef,
  onAudioElementChange,
}) {
  const audioRef = useRef(null);
  const audioObjectUrlRef = useRef(null);
  const [audioSrc, setAudioSrc] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingActions, setPlayingActions] = useState({});
  const [isBlendTesting, setIsBlendTesting] = useState(false);
  const actionEntries = Object.entries(VRMA_ACTIONS);

  useEffect(
    /**
     * 组件卸载时释放音频对象 URL。
     *
     * @returns {Function} 清理函数。
     */
    () => () => {
      if (audioObjectUrlRef.current) {
        URL.revokeObjectURL(audioObjectUrlRef.current);
        audioObjectUrlRef.current = null;
      }
    },
    []
  );

  /**
   * 设置指定动作按钮的播放状态。
   *
   * @param {string} actionName 动作名称。
   * @param {boolean} isActionPlaying 动作是否正在播放。
   * @returns {void}
   */
  const setActionPlaying = (actionName, isActionPlaying) => {
    setPlayingActions((currentPlayingActions) => ({
      ...currentPlayingActions,
      [actionName]: isActionPlaying,
    }));
  };

  /**
   * 处理音频文件选择。
   *
   * @param {Event} event 文件输入事件。
   * @returns {void}
   */
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (audioObjectUrlRef.current) {
      URL.revokeObjectURL(audioObjectUrlRef.current);
    }

    const url = URL.createObjectURL(file);
    audioObjectUrlRef.current = url;
    setAudioSrc(url);
    setIsPlaying(false);
  };

  /**
   * 切换音频播放和暂停状态。
   *
   * @returns {void}
   */
  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !audioSrc) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    audio.play();
    setIsPlaying(true);
  };

  /**
   * 播放指定 VRMA 动作。
   *
   * @param {string} actionName 动作名称。
   * @returns {Promise<void>} 播放完成信号。
   */
  const playVRMAAction = async (actionName) => {
    if (!vrm || !vrmaControllerRef.current || playingActions[actionName]) return;

    setActionPlaying(actionName, true);
    try {
      await vrmaControllerRef.current.playAction(actionName);
    } finally {
      setActionPlaying(actionName, false);
    }
  };

  /**
   * 触发动作混合测试。
   *
   * @returns {Promise<void>} 混合测试完成信号。
   */
  const testBlendActions = async () => {
    if (!vrm || !vrmaControllerRef.current || isBlendTesting) return;

    setIsBlendTesting(true);
    try {
      await vrmaControllerRef.current.blendActions(
        {
          VRMA_01: 0.3,
          VRMA_04: 0.7,
        },
        { fadeDuration: 0.25, normalize: true }
      );
    } finally {
      window.setTimeout(() => {
        vrmaControllerRef.current?.restoreIdle();
        setIsBlendTesting(false);
      }, 800);
    }
  };

  /**
   * 处理音频播放结束事件。
   *
   * @returns {void}
   */
  const handleAudioEnded = () => {
    setIsPlaying(false);
  };

  /**
   * 渲染单个动作按钮。
   *
   * @param {string} actionName 动作名称。
   * @param {string} activeLabel 动作播放中显示的文案。
   * @param {string} background 按钮背景色。
   * @returns {import("react").JSX.Element} 动作按钮元素。
   */
  const renderActionButton = (actionName, activeLabel, background) => {
    const isActionPlaying = Boolean(playingActions[actionName]);

    return (
      <button
        onClick={() => playVRMAAction(actionName)}
        disabled={!vrm || isActionPlaying}
        style={{
          ...buttonStyle,
          background: isActionPlaying ? "#777" : background,
          opacity: !vrm ? 0.6 : 1,
        }}
      >
        {isActionPlaying ? activeLabel : VRMA_ACTIONS[actionName].label}
      </button>
    );
  };

  return (
    <div className="debug-controls-scroll" style={panelStyle}>
      <style>
        {`
          .debug-controls-scroll::-webkit-scrollbar {
            width: 0;
            height: 0;
            background: transparent;
          }
        `}
      </style>

      <div style={controlsStackStyle}>
        <audio
          ref={(element) => {
            audioRef.current = element;
            onAudioElementChange(element);
          }}
          src={audioSrc}
          onEnded={handleAudioEnded}
          style={{ display: "none" }}
        />

        <label
          style={{
            ...buttonStyle,
            background: "#333",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
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

        {audioSrc && (
          <button
            onClick={togglePlay}
            style={{
              ...buttonStyle,
              background: isPlaying ? "#ff4444" : "#4CAF50",
            }}
          >
            {isPlaying ? "暂停" : "播放"}
          </button>
        )}

        {actionEntries.map(([actionName, action], index) => (
          <div key={actionName}>
            {renderActionButton(
              actionName,
              `${action.label} 中`,
              actionButtonColors[index % actionButtonColors.length]
            )}
          </div>
        ))}

        <button
          onClick={testBlendActions}
          disabled={!vrm || isBlendTesting}
          style={{
            ...buttonStyle,
            background: isBlendTesting ? "#777" : "#00BCD4",
            opacity: !vrm ? 0.6 : 1,
          }}
        >
          {isBlendTesting ? "混合中" : "混合测试"}
        </button>

        {audioSrc && (
          <div style={meterStyle}>
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
      </div>
    </div>
  );
}
