import { createVRMAnimationClip } from "@pixiv/three-vrm-animation";
import { parseVRMA } from "../utils/vrmaParser";
import { ActionController } from "./ActionController";
import { VRMA_ACTIONS_TYPES } from "./VRMA_ACTIONS_TYPES";
import { VRMAIdleLayer } from "./VRMAIdleLayer";

/**
 * VRMA 动作配置。
 *
 * @typedef {object} VRMAActionConfig
 * @property {string} fileName VRMA 文件名。
 * @property {string} label 动作显示名称。
 * @property {string} url VRMA 文件 URL。
 */

/**
 * VRMA 动作控制器配置。
 *
 * @typedef {object} VRMAActionControllerOptions
 * @property {number} [fadeDuration] 默认淡入淡出时长，单位秒。
 */

/**
 * VRMA 动作系统初始化配置。
 *
 * @typedef {object} VRMAActionSystemOptions
 * @property {import("./VRMAIdleLayer").VRMAIdleLayerOptions} [idle] 待机层配置。
 */

/**
 * VRMA 动作配置映射。
 *
 * @type {Record<string, VRMAActionConfig>}
 */
export const VRMA_ACTIONS = VRMA_ACTIONS_TYPES;

/**
 * 根据动作名称获取 VRMA 动作配置。
 *
 * @param {string} actionName 动作名称，必须和 VRMA 文件名不含扩展名的部分一致。
 * @returns {VRMAActionConfig} VRMA 动作配置。
 */
export const getVRMAAction = (actionName) => {
  const action = VRMA_ACTIONS[actionName];

  if (!action) {
    throw new Error(`Unknown VRMA action: ${actionName}`);
  }

  return action;
};

/**
 * 面向 VRM 模型的 VRMA 动作控制器。
 *
 * @class
 * @extends {ActionController}
 */
export class VRMAActionController extends ActionController {
  /**
   * 创建 VRMA 动作控制器实例。
   *
   * @param {object} vrm 已加载的 VRM 实例。
   * @param {VRMAActionControllerOptions} [options={}] 控制器配置项。
   */
  constructor(vrm, options = {}) {
    super(vrm.scene, options);

    this.vrm = vrm;
    this.idleLayer = null;
    this.registerVRMAActions(VRMA_ACTIONS);
  }

  /**
   * 初始化 VRMA 动作系统。
   *
   * @param {VRMAActionSystemOptions} [options={}] 动作系统初始化配置。
   * @returns {VRMAActionController} 当前控制器实例。
   */
  initializeActionSystem(options = {}) {
    this.idleLayer = new VRMAIdleLayer(this, VRMA_ACTIONS, options.idle);
    return this;
  }

  /**
   * 批量注册 VRMA 动作。
   *
   * @param {Record<string, VRMAActionConfig>} actions 动作配置映射。
   * @returns {VRMAActionController} 当前控制器实例。
   */
  registerVRMAActions(actions) {
    for (const [actionName, actionConfig] of Object.entries(actions)) {
      this.registerVRMAAction(actionName, actionConfig.url);
    }

    return this;
  }

  /**
   * 注册单个 VRMA 动作。
   *
   * @param {string} actionName 动作名称。
   * @param {string} url VRMA 文件 URL。
   * @returns {VRMAActionController} 当前控制器实例。
   */
  registerVRMAAction(actionName, url) {
    this.registerClip(actionName, () => this.loadVRMAClip(url));
    return this;
  }

  /**
   * 加载 VRMA 文件并转换为当前 VRM 可播放的 AnimationClip。
   *
   * @param {string} url VRMA 文件 URL。
   * @returns {Promise<import("three").AnimationClip>} Three.js 动画剪辑。
   */
  async loadVRMAClip(url) {
    const vrmAnimation = await parseVRMA(url);
    return createVRMAnimationClip(vrmAnimation, this.vrm);
  }

  /**
   * 确保任意 URL 形式的 VRMA 动作已经注册。
   *
   * @param {string} url VRMA 文件 URL。
   * @returns {string} 内部使用的 URL 动作名称。
   */
  ensureUrlAction(url) {
    const actionName = `url:${url}`;

    if (!this.hasClip(actionName)) {
      this.registerVRMAAction(actionName, url);
    }

    return actionName;
  }

  /**
   * 播放命名 VRMA 动作，并与待机层协作。
   *
   * @param {string} actionName 动作名称。
   * @param {object} [options] 播放配置。
   * @returns {Promise<import("three").AnimationAction>|Promise<void>} 动作或完成信号。
   */
  playAction(actionName, options) {
    getVRMAAction(actionName);
    return this.playActionWithIdle(actionName, options);
  }

  /**
   * 播放指定 URL 对应的 VRMA 动作。
   *
   * @param {string} url VRMA 文件 URL。
   * @param {object} [options] 播放配置。
   * @returns {Promise<import("three").AnimationAction>|Promise<void>} 动作或完成信号。
   */
  playUrl(url, options) {
    return this.play(this.ensureUrlAction(url), options);
  }

  /**
   * 混合多个 VRMA 动作，同时保留基础待机层。
   *
   * @param {Record<string, number>} targetWeights 动作权重映射。
   * @param {object} [options] 混合配置。
   * @returns {Promise<void>} 混合完成信号。
   */
  blendActions(targetWeights, options) {
    if (!this.idleLayer) {
      return this.blend(targetWeights, options);
    }

    this.idleLayer.duck();
    return this.blend(
      {
        [this.idleLayer.baseActionName]: this.idleLayer.baseWeight,
        ...targetWeights,
      },
      options
    );
  }

  /**
   * 在两个 VRMA 动作之间执行交叉淡入淡出。
   *
   * @param {string} fromActionName 源动作名称。
   * @param {string} toActionName 目标动作名称。
   * @param {object} [options] 交叉淡入配置。
   * @returns {Promise<import("three").AnimationAction>} 目标动作实例。
   */
  crossFadeAction(fromActionName, toActionName, options) {
    getVRMAAction(fromActionName);
    getVRMAAction(toActionName);
    return this.crossFade(fromActionName, toActionName, options);
  }

  /**
   * 将 VRMA 动作绑定到音频强度。
   *
   * @param {string} actionName 动作名称。
   * @param {object} [options] 音频驱动配置。
   * @returns {VRMAActionController} 当前控制器实例。
   */
  bindAudioAction(actionName, options) {
    getVRMAAction(actionName);
    this.bindAudio(actionName, options);
    return this;
  }

  /**
   * 播放由音频强度驱动的 VRMA 动作。
   *
   * @param {string} actionName 动作名称。
   * @param {object} [options] 音频驱动播放配置。
   * @returns {Promise<import("three").AnimationAction>} 音频驱动动作实例。
   */
  playAudioDrivenAction(actionName, options) {
    getVRMAAction(actionName);
    return this.playAudioDriven(actionName, options);
  }

  /**
   * 解除 VRMA 动作的音频强度绑定。
   *
   * @param {string} actionName 动作名称。
   * @returns {VRMAActionController} 当前控制器实例。
   */
  unbindAudioAction(actionName) {
    this.unbindAudio(actionName);
    return this;
  }

  /**
   * 停止所有动作并恢复待机层。
   *
   * @param {number} [fadeDuration] 淡出时长，单位秒。
   * @returns {void}
   */
  stopActions(fadeDuration) {
    this.stopAll(fadeDuration);
    this.idleLayer?.restore(fadeDuration);
  }

  /**
   * 启动 VRM 待机层。
   *
   * @param {object} [options] 待机层配置项。
   * @returns {VRMAActionController} 当前控制器实例。
   */
  startIdle(options) {
    if (!this.idleLayer) {
      throw new Error("VRMA action system has not been initialized.");
    }

    this.idleLayer.start(options);
    return this;
  }

  /**
   * 停止 VRM 待机层。
   *
   * @param {number} [fadeDuration] 淡出时长，单位秒。
   * @returns {VRMAActionController} 当前控制器实例。
   */
  stopIdle(fadeDuration) {
    this.idleLayer?.stop(fadeDuration);
    return this;
  }

  /**
   * 恢复 VRM 待机层权重。
   *
   * @param {number} [fadeDuration] 淡入时长，单位秒。
   * @returns {VRMAActionController} 当前控制器实例。
   */
  restoreIdle(fadeDuration) {
    this.idleLayer?.restore(fadeDuration);
    return this;
  }

  /**
   * 在待机层存在时播放前景动作。
   *
   * @param {string} actionName 动作名称。
   * @param {object} [options={}] 播放配置。
   * @returns {Promise<import("three").AnimationAction>|Promise<void>} 动作或完成信号。
   */
  async playActionWithIdle(actionName, options = {}) {
    if (!this.idleLayer) {
      return this.play(actionName, options);
    }

    const wasIdleEnabled = this.idleLayer.enabled;

    this.idleLayer.enterForeground(options.fadeDuration);

    try {
      return await this.play(actionName, {
        ...options,
        stopOthers: options.stopOthers ?? false,
      });
    } finally {
      if (wasIdleEnabled) {
        this.idleLayer.exitForeground(options.fadeDuration);
      }
    }
  }

  /**
   * 释放 VRMA 控制器和待机层资源。
   *
   * @returns {void}
   */
  dispose() {
    this.idleLayer?.dispose();
    super.dispose();
  }
}

/**
 * 创建 VRMA 动作控制器。
 *
 * @param {object} vrm 已加载的 VRM 实例。
 * @param {VRMAActionControllerOptions} [options] 控制器配置项。
 * @returns {VRMAActionController} VRMA 动作控制器实例。
 */
export const createVRMAActionController = (vrm, options) =>
  new VRMAActionController(vrm, options);

/**
 * 创建 VRMA 动作控制器的兼容别名。
 *
 * @type {typeof createVRMAActionController}
 */
export const createVRMAMotionController = createVRMAActionController;
