/**
 * 动画层配置。
 *
 * @typedef {object} AnimationLayerOptions
 * @property {number} [weight] 默认权重。
 * @property {number} [fadeDuration] 默认淡入淡出时长，单位秒。
 */

/**
 * 管理多个可叠加动画层的控制器。
 *
 * @class
 */
export class AnimationLayerController {
  /**
   * 创建动画层控制器实例。
   *
   * @param {object} actionController 动作控制器实例。
   * @param {AnimationLayerOptions} [options={}] 控制器配置项。
   */
  constructor(actionController, options = {}) {
    this.actionController = actionController;
    this.weight = options.weight ?? 1;
    this.fadeDuration = options.fadeDuration ?? 0.35;
    this.layers = new Map();
  }

  /**
   * 注册一个动画层。
   *
   * @param {string} layerName 层名称。
   * @param {object} layer 层对象。
   * @param {object} [definition={}] 层定义。
   * @returns {AnimationLayerController} 当前控制器实例。
   */
  registerLayer(layerName, layer, definition = {}) {
    this.layers.set(layerName, {
      name: layerName,
      layer,
      weight: definition.weight ?? this.weight,
      enabled: definition.enabled ?? false,
    });

    return this;
  }

  /**
   * 批量注册动画层。
   *
   * @param {Record<string, AnimationLayerDefinition>} definitions 层定义映射。
   * @returns {AnimationLayerController} 当前控制器实例。
   */
  registerLayers(definitions) {
    for (const [layerName, definition] of Object.entries(definitions)) {
      this.registerLayer(layerName, definition);
    }

    return this;
  }

  /**
   * 获取动画层。
   *
   * @param {string} layerName 层名称。
   * @returns {object|null} 层对象。
   */
  getLayer(layerName) {
    return this.layers.get(layerName)?.layer ?? null;
  }

  /**
   * 获取层状态。
   *
   * @param {string} layerName 层名称。
   * @returns {object|null} 层状态。
   */
  getLayerState(layerName) {
    return this.layers.get(layerName) ?? null;
  }

  /**
   * 启动指定层。
   *
   * @param {string} layerName 层名称。
   * @param {object} [options={}] 启动配置。
   * @returns {AnimationLayerController} 当前控制器实例。
   */
  startLayer(layerName, options = {}) {
    const layerState = this.getLayerState(layerName);
    if (!layerState?.layer?.start) return this;

    layerState.enabled = true;
    layerState.layer.start(options);
    return this;
  }

  /**
   * 停止指定层。
   *
   * @param {string} layerName 层名称。
   * @param {number} [fadeDuration=this.fadeDuration] 淡出时长，单位秒。
   * @returns {AnimationLayerController} 当前控制器实例。
   */
  stopLayer(layerName, fadeDuration = this.fadeDuration) {
    const layerState = this.getLayerState(layerName);
    if (!layerState?.layer?.stop) return this;

    layerState.enabled = false;
    layerState.layer.stop(fadeDuration);
    return this;
  }

  /**
   * 设置层权重。
   *
   * @param {string} layerName 层名称。
   * @param {number} weight 层权重。
   * @param {number} [fadeDuration=this.fadeDuration] 淡入淡出时长，单位秒。
   * @returns {AnimationLayerController} 当前控制器实例。
   */
  setLayerWeight(layerName, weight, fadeDuration = this.fadeDuration) {
    const layerState = this.getLayerState(layerName);
    if (!layerState?.layer) return this;

    layerState.weight = weight;

    if (typeof layerState.layer.setWeight === "function") {
      layerState.layer.setWeight(weight, fadeDuration);
    } else if (weight <= 0 && typeof layerState.layer.stop === "function") {
      layerState.layer.stop(fadeDuration);
    } else if (weight > 0 && typeof layerState.layer.start === "function") {
      layerState.layer.start({ fadeDuration, weight });
    }

    return this;
  }

  /**
   * 启用层。
   *
   * @param {string} layerName 层名称。
   * @returns {AnimationLayerController} 当前控制器实例。
   */
  enableLayer(layerName) {
    const layerState = this.getLayerState(layerName);
    if (layerState) layerState.enabled = true;
    return this;
  }

  /**
   * 禁用层。
   *
   * @param {string} layerName 层名称。
   * @param {number} [fadeDuration=this.fadeDuration] 淡出时长，单位秒。
   * @returns {AnimationLayerController} 当前控制器实例。
   */
  disableLayer(layerName, fadeDuration = this.fadeDuration) {
    this.stopLayer(layerName, fadeDuration);
    return this;
  }

  /**
   * 释放控制器资源。
   *
   * @returns {void}
   */
  dispose() {
    for (const layerName of this.layers.keys()) {
      this.stopLayer(layerName, 0);
    }

    this.layers.clear();
  }
}

/**
 * 创建动画层控制器。
 *
 * @param {object} actionController 动作控制器实例。
 * @param {AnimationLayerOptions} [options] 控制器配置项。
 * @returns {AnimationLayerController} 动画层控制器实例。
 */
export const createAnimationLayerController = (actionController, options) =>
  new AnimationLayerController(actionController, options);
