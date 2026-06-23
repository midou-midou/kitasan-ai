import * as THREE from "three";

/**
 * 动作播放配置。
 *
 * @typedef {object} ActionPlayOptions
 * @property {number} [fadeDuration] 淡入淡出时长，单位秒。
 * @property {number} [loop] Three.js 循环模式。
 * @property {number} [repetitions] 循环次数。
 * @property {boolean} [clampWhenFinished] 播放结束后是否保持最后一帧。
 * @property {number} [timeScale] 播放速度倍率。
 * @property {number} [weight] 动作权重。
 * @property {boolean} [stopOthers] 是否淡出其他动作。
 * @property {boolean} [reset] 播放前是否重置动作时间。
 * @property {boolean} [waitUntilFinished] 是否等待动作播放完成。
 */

/**
 * 音频驱动权重配置。
 *
 * @typedef {object} AudioBindingOptions
 * @property {number} [minWeight] 最小权重。
 * @property {number} [maxWeight] 最大权重。
 * @property {number} [threshold] 音量阈值。
 * @property {number} [gain] 音量增益。
 * @property {number} [attack] 权重上升平滑系数。
 * @property {number} [release] 权重下降平滑系数。
 * @property {boolean} [invert] 是否反向映射音量。
 * @property {number} [fadeDuration] 淡入淡出时长，单位秒。
 */

const DEFAULT_FADE_DURATION = 0.25;
const DEFAULT_AUDIO_THRESHOLD = 0.04;
const DEFAULT_AUDIO_GAIN = 1.8;
const DEFAULT_AUDIO_ATTACK = 0.35;
const DEFAULT_AUDIO_RELEASE = 0.12;

/**
 * 将数值限制在 0 到 1 之间。
 *
 * @param {number} value 需要限制范围的原始数值。
 * @returns {number} 限制后的归一化数值。
 */
const clamp01 = (value) => Math.min(Math.max(value, 0), 1);

/**
 * 解析动画剪辑或异步剪辑加载函数。
 *
 * @param {THREE.AnimationClip|Function} clipOrLoader 动画剪辑或返回动画剪辑的函数。
 * @returns {Promise<THREE.AnimationClip>} 解析后的 Three.js 动画剪辑。
 */
const resolveClip = async (clipOrLoader) => {
  if (typeof clipOrLoader === "function") {
    return clipOrLoader();
  }

  return clipOrLoader;
};

/**
 * 基于 Three.js AnimationMixer 的通用动作控制器。
 *
 * @class
 */
export class ActionController {
  /**
   * 创建动作控制器实例。
   *
   * @param {THREE.Object3D} root 动画混合器绑定的根对象。
   * @param {object} [options={}] 控制器配置项。
   * @param {number} [options.fadeDuration] 默认淡入淡出时长，单位秒。
   */
  constructor(root, options = {}) {
    if (!root) {
      throw new Error("ActionController requires an animation root.");
    }

    this.root = root;
    this.mixer = new THREE.AnimationMixer(root);
    this.fadeDuration = options.fadeDuration ?? DEFAULT_FADE_DURATION;
    this.actions = new Map();
    this.clipLoaders = new Map();
    this.clipPromises = new Map();
    this.activeActions = new Map();
    this.finishedListeners = new Map();
    this.playResolvers = new Map();
    this.audioBindings = new Map();
    this.audioValue = 0;
  }

  /**
   * 注册单个动画剪辑或剪辑加载函数。
   *
   * @param {string} name 动作名称。
   * @param {THREE.AnimationClip|Function} clipOrLoader 动画剪辑或返回动画剪辑的加载函数。
   * @returns {ActionController} 当前控制器实例。
   */
  registerClip(name, clipOrLoader) {
    this.clipLoaders.set(name, clipOrLoader);
    this.clipPromises.delete(name);
    return this;
  }

  /**
   * 批量注册动画剪辑。
   *
   * @param {Record<string, THREE.AnimationClip|Function>} clips 动作名称到剪辑或加载函数的映射。
   * @returns {ActionController} 当前控制器实例。
   */
  registerClips(clips) {
    for (const [name, clipOrLoader] of Object.entries(clips)) {
      this.registerClip(name, clipOrLoader);
    }

    return this;
  }

  /**
   * 判断指定动作是否已经注册。
   *
   * @param {string} name 动作名称。
   * @returns {boolean} 动作是否存在。
   */
  hasClip(name) {
    return this.clipLoaders.has(name);
  }

  /**
   * 获取指定动作的动画剪辑，并缓存异步加载结果。
   *
   * @param {string} name 动作名称。
   * @returns {Promise<THREE.AnimationClip>} 动画剪辑。
   */
  async getClip(name) {
    if (!this.clipLoaders.has(name)) {
      throw new Error(`Unknown animation clip: ${name}`);
    }

    if (!this.clipPromises.has(name)) {
      this.clipPromises.set(name, Promise.resolve(resolveClip(this.clipLoaders.get(name))));
    }

    const clip = await this.clipPromises.get(name);
    if (!clip) {
      throw new Error(`Animation clip loader returned nothing: ${name}`);
    }

    return clip;
  }

  /**
   * 获取指定动作对应的 AnimationAction。
   *
   * @param {string} name 动作名称。
   * @returns {Promise<THREE.AnimationAction>} Three.js 动画动作实例。
   */
  async getAction(name) {
    if (this.actions.has(name)) {
      return this.actions.get(name);
    }

    const clip = await this.getClip(name);
    const action = this.mixer.clipAction(clip);
    this.actions.set(name, action);
    return action;
  }

  /**
   * 播放指定动作。
   *
   * @param {string} name 动作名称。
   * @param {object} [options={}] 播放配置。
   * @param {number} [options.fadeDuration] 淡入淡出时长，单位秒。
   * @param {number} [options.loop] Three.js 循环模式。
   * @param {number} [options.repetitions] 循环次数。
   * @param {boolean} [options.clampWhenFinished] 播放结束后是否保持最后一帧。
   * @param {number} [options.timeScale] 播放速度倍率。
   * @param {number} [options.weight] 动作权重。
   * @param {boolean} [options.stopOthers] 是否淡出其他动作。
   * @param {boolean} [options.reset] 播放前是否重置动作时间。
   * @param {boolean} [options.waitUntilFinished] 是否等待动作播放完成。
   * @returns {Promise<THREE.AnimationAction>|Promise<void>} 动作或完成信号。
   */
  async play(name, options = {}) {
    const {
      fadeDuration = this.fadeDuration,
      loop = THREE.LoopOnce,
      repetitions = loop === THREE.LoopOnce ? 1 : Infinity,
      clampWhenFinished = true,
      timeScale = 1,
      weight = 1,
      stopOthers = true,
      reset = true,
      waitUntilFinished = loop === THREE.LoopOnce,
    } = options;
    const action = await this.getAction(name);

    if (stopOthers) {
      this.fadeOutOthers(name, fadeDuration);
    }

    if (reset) {
      action.reset();
    }

    action.enabled = true;
    action.setLoop(loop, repetitions);
    action.clampWhenFinished = clampWhenFinished;
    action.timeScale = timeScale;
    action.setEffectiveWeight(weight);
    action.fadeIn(fadeDuration);
    action.play();
    this.activeActions.set(name, action);

    if (!waitUntilFinished) {
      return action;
    }

    return new Promise((resolve) => {
      /**
       * 处理 Three.js 动作完成事件。
       *
       * @param {{action: THREE.AnimationAction}} event 动作完成事件。
       * @returns {void}
       */
      const handleFinished = (event) => {
        if (event.action !== action) return;

        this.mixer.removeEventListener("finished", handleFinished);
        this.finishedListeners.delete(name);
        this.activeActions.delete(name);
        this.resolvePlay(name, action);
      };

      this.clearFinishedListener(name);
      this.resolvePlay(name, action);
      this.playResolvers.set(name, resolve);
      this.finishedListeners.set(name, handleFinished);
      this.mixer.addEventListener("finished", handleFinished);
    });
  }

  /**
   * 按权重混合多个动作。
   *
   * @param {Record<string, number>} targetWeights 动作名称到目标权重的映射。
   * @param {object} [options={}] 混合配置。
   * @param {number} [options.fadeDuration] 淡入淡出时长，单位秒。
   * @param {boolean} [options.normalize] 是否归一化传入权重。
   * @param {boolean} [options.playMissing] 不存在的动作是否自动创建并播放。
   * @returns {Promise<void>} 混合完成信号。
   */
  async blend(targetWeights, options = {}) {
    const { fadeDuration = this.fadeDuration, normalize = false, playMissing = true } = options;
    const entries = Object.entries(targetWeights).filter(([, weight]) => weight > 0);
    const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0) || 1;
    const targetNames = new Set(Object.keys(targetWeights));

    for (const [name, rawWeight] of Object.entries(targetWeights)) {
      const action = this.actions.get(name) ?? (playMissing ? await this.getAction(name) : null);
      if (!action) continue;

      const weight = normalize ? rawWeight / totalWeight : rawWeight;
      action.enabled = weight > 0;

      if (weight > 0 && !action.isRunning()) {
        action.reset().play();
        this.activeActions.set(name, action);
      }

      action.fadeIn(fadeDuration);
      action.setEffectiveWeight(clamp01(weight));
    }

    for (const [name, action] of this.activeActions) {
      if (targetNames.has(name)) continue;

      action.fadeOut(fadeDuration);
      this.activeActions.delete(name);
    }
  }

  /**
   * 从一个动作交叉淡入到另一个动作。
   *
   * @param {string} fromName 源动作名称。
   * @param {string} toName 目标动作名称。
   * @param {object} [options={}] 交叉淡入配置。
   * @param {number} [options.fadeDuration] 淡入淡出时长，单位秒。
   * @param {boolean} [options.warp] 是否在过渡时调整播放速度。
   * @param {number} [options.loop] 目标动作循环模式。
   * @returns {Promise<THREE.AnimationAction>} 目标动作实例。
   */
  async crossFade(fromName, toName, options = {}) {
    const { fadeDuration = this.fadeDuration, warp = false, loop = THREE.LoopOnce } = options;
    const fromAction = this.actions.get(fromName);
    const toAction = await this.getAction(toName);

    toAction.reset();
    toAction.enabled = true;
    toAction.setLoop(loop, loop === THREE.LoopOnce ? 1 : Infinity);
    toAction.play();

    if (fromAction) {
      fromAction.crossFadeTo(toAction, fadeDuration, warp);
      this.activeActions.delete(fromName);
    } else {
      toAction.fadeIn(fadeDuration);
    }

    this.activeActions.set(toName, toAction);
    return toAction;
  }

  /**
   * 播放由音频强度驱动权重的动作。
   *
   * @param {string} name 动作名称。
   * @param {object} [options={}] 音频驱动播放配置。
   * @param {number} [options.loop] 循环模式。
   * @param {number} [options.repetitions] 循环次数。
   * @param {number} [options.initialWeight] 初始权重。
   * @param {number} [options.fadeDuration] 淡入淡出时长，单位秒。
   * @param {object} [options.audio] 音频权重映射配置。
   * @returns {Promise<THREE.AnimationAction>} 音频驱动的动作实例。
   */
  async playAudioDriven(name, options = {}) {
    const {
      loop = THREE.LoopRepeat,
      repetitions = Infinity,
      initialWeight = 0,
      fadeDuration = this.fadeDuration,
      audio = {},
    } = options;
    const action = await this.getAction(name);

    action.reset();
    action.enabled = true;
    action.setLoop(loop, repetitions);
    action.setEffectiveWeight(initialWeight);
    action.fadeIn(fadeDuration);
    action.play();
    this.activeActions.set(name, action);
    this.bindAudio(name, audio);

    return action;
  }

  /**
   * 绑定动作权重到音频强度。
   *
   * @param {string} name 动作名称。
   * @param {object} [options={}] 音频映射配置。
   * @param {number} [options.minWeight] 最小权重。
   * @param {number} [options.maxWeight] 最大权重。
   * @param {number} [options.threshold] 音量阈值。
   * @param {number} [options.gain] 音量增益。
   * @param {number} [options.attack] 权重上升平滑系数。
   * @param {number} [options.release] 权重下降平滑系数。
   * @param {boolean} [options.invert] 是否反向映射音量。
   * @param {number} [options.fadeDuration] 淡入淡出时长，单位秒。
   * @returns {ActionController} 当前控制器实例。
   */
  bindAudio(name, options = {}) {
    this.audioBindings.set(name, {
      minWeight: options.minWeight ?? 0,
      maxWeight: options.maxWeight ?? 1,
      threshold: options.threshold ?? DEFAULT_AUDIO_THRESHOLD,
      gain: options.gain ?? DEFAULT_AUDIO_GAIN,
      attack: options.attack ?? DEFAULT_AUDIO_ATTACK,
      release: options.release ?? DEFAULT_AUDIO_RELEASE,
      invert: options.invert ?? false,
      fadeDuration: options.fadeDuration ?? 0.1,
    });

    return this;
  }

  /**
   * 解除动作的音频权重绑定。
   *
   * @param {string} name 动作名称。
   * @returns {ActionController} 当前控制器实例。
   */
  unbindAudio(name) {
    this.audioBindings.delete(name);
    return this;
  }

  /**
   * 设置当前音频强度。
   *
   * @param {number} level 归一化音频强度。
   * @returns {ActionController} 当前控制器实例。
   */
  setAudioLevel(level) {
    this.audioValue = clamp01(level);
    return this;
  }

  /**
   * 停止指定动作。
   *
   * @param {string} name 动作名称。
   * @param {number} [fadeDuration=this.fadeDuration] 淡出时长，单位秒。
   * @returns {void}
   */
  stop(name, fadeDuration = this.fadeDuration) {
    const action = this.actions.get(name);
    if (!action) return;

    action.fadeOut(fadeDuration);
    this.clearFinishedListener(name);
    this.activeActions.delete(name);
    this.resolvePlay(name, action);
  }

  /**
   * 停止所有当前活跃动作。
   *
   * @param {number} [fadeDuration=this.fadeDuration] 淡出时长，单位秒。
   * @returns {void}
   */
  stopAll(fadeDuration = this.fadeDuration) {
    for (const name of Array.from(this.activeActions.keys())) {
      this.stop(name, fadeDuration);
    }
  }

  /**
   * 淡出除指定动作外的其他活跃动作。
   *
   * @param {string} activeName 需要保留的动作名称。
   * @param {number} [fadeDuration=this.fadeDuration] 淡出时长，单位秒。
   * @returns {void}
   */
  fadeOutOthers(activeName, fadeDuration = this.fadeDuration) {
    for (const [name, action] of Array.from(this.activeActions)) {
      if (name === activeName) continue;

      action.fadeOut(fadeDuration);
      this.clearFinishedListener(name);
      this.activeActions.delete(name);
      this.resolvePlay(name, action);
    }
  }

  /**
   * 推进动画混合器和音频驱动权重。
   *
   * @param {number} delta 距上一帧的时间，单位秒。
   * @returns {void}
   */
  update(delta) {
    this.updateAudioBindings();
    this.mixer.update(delta);
  }

  /**
   * 释放控制器占用的动画资源。
   *
   * @returns {void}
   */
  dispose() {
    for (const name of this.finishedListeners.keys()) {
      this.clearFinishedListener(name);
    }
    for (const [name, action] of this.actions) {
      this.resolvePlay(name, action);
    }

    this.audioBindings.clear();
    this.activeActions.clear();
    this.actions.clear();
    this.clipLoaders.clear();
    this.clipPromises.clear();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
  }

  /**
   * 清理指定动作的完成事件监听器。
   *
   * @param {string} name 动作名称。
   * @returns {void}
   */
  clearFinishedListener(name) {
    const listener = this.finishedListeners.get(name);
    if (!listener) return;

    this.mixer.removeEventListener("finished", listener);
    this.finishedListeners.delete(name);
  }

  /**
   * 主动结束指定动作对应的等待 Promise。
   *
   * @param {string} name 动作名称。
   * @param {THREE.AnimationAction} action 动作实例。
   * @returns {void}
   */
  resolvePlay(name, action) {
    const resolve = this.playResolvers.get(name);
    if (!resolve) return;

    this.playResolvers.delete(name);
    resolve(action);
  }

  /**
   * 根据当前音频强度更新所有音频绑定动作的权重。
   *
   * @returns {void}
   */
  updateAudioBindings() {
    for (const [name, binding] of this.audioBindings) {
      const action = this.actions.get(name);
      if (!action) continue;

      const normalizedLevel = clamp01((this.audioValue - binding.threshold) * binding.gain);
      const drivenLevel = binding.invert ? 1 - normalizedLevel : normalizedLevel;
      const targetWeight = THREE.MathUtils.lerp(
        binding.minWeight,
        binding.maxWeight,
        drivenLevel
      );
      const currentWeight = action.getEffectiveWeight();
      const smoothing = targetWeight > currentWeight ? binding.attack : binding.release;
      const nextWeight = THREE.MathUtils.lerp(currentWeight, targetWeight, smoothing);

      if (!action.isRunning() && nextWeight > 0.001) {
        action.reset().fadeIn(binding.fadeDuration).play();
        this.activeActions.set(name, action);
      }

      action.enabled = nextWeight > 0.001;
      action.setEffectiveWeight(clamp01(nextWeight));
    }
  }
}

/**
 * 创建通用动作控制器。
 *
 * @param {THREE.Object3D} root 动画混合器绑定的根对象。
 * @param {object} [options] 控制器配置项。
 * @returns {ActionController} 动作控制器实例。
 */
export const createActionController = (root, options) => new ActionController(root, options);
