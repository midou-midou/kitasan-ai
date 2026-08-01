/**
 * VRM 表情控制器配置。
 *
 * @typedef {object} VRMExpressionControllerOptions
 * @property {Record<string, string[]>} [groups] 表情分组映射。
 * @property {boolean} [clamp] 是否将表情权重限制在 0 到 1。
 */

const clamp01 = (value) => Math.min(Math.max(value, 0), 1);

/**
 * 面向 VRM 模型的表情控制器。
 *
 * @class
 */
export class VRMExpressionController {
  /**
   * 创建 VRM 表情控制器实例。
   *
   * @param {object|null} vrm 已加载的 VRM 实例。
   * @param {VRMExpressionControllerOptions} [options={}] 控制器配置项。
   */
  constructor(vrm, options = {}) {
    this.vrm = vrm ?? null;
    this.expressionManager = vrm?.expressionManager ?? null;
    this.clamp = options.clamp ?? true;
    this.values = new Map();
    this.groupValues = new Map();
    this.expressionGroups = new Map();
    this.registerGroups(options.groups ?? {});
  }

  /**
   * 注册多个表情分组。
   *
   * @param {Record<string, string[]>} groups 表情分组映射。
   * @returns {VRMExpressionController} 当前控制器实例。
   */
  registerGroups(groups) {
    for (const [groupName, expressionNames] of Object.entries(groups)) {
      this.registerGroup(groupName, expressionNames);
    }

    return this;
  }

  /**
   * 注册单个表情分组。
   *
   * @param {string} groupName 分组名称。
   * @param {string[]} expressionNames 表情名称列表。
   * @returns {VRMExpressionController} 当前控制器实例。
   */
  registerGroup(groupName, expressionNames = []) {
    for (const expressionName of expressionNames) {
      this.expressionGroups.set(expressionName, groupName);
    }

    return this;
  }

  /**
   * 获取表情所属分组。
   *
   * @param {string} expressionName 表情名称。
   * @returns {string|null} 分组名称。
   */
  getGroupName(expressionName) {
    return this.expressionGroups.get(expressionName) ?? null;
  }

  /**
   * 设置单个表情权重。
   *
   * @param {string} expressionName 表情名称。
   * @param {number} value 表情权重。
   * @returns {VRMExpressionController} 当前控制器实例。
   */
  setValue(expressionName, value) {
    const groupName = this.getGroupName(expressionName);
    if (groupName) {
      return this.setGroupValue(groupName, expressionName, value);
    }

    const nextValue = this.clamp ? clamp01(value) : value;
    this.values.set(expressionName, nextValue);
    this.expressionManager?.setValue(expressionName, nextValue);
    return this;
  }

  /**
   * 设置指定分组中的表情权重，并清除同组内其他表情。
   *
   * @param {string} groupName 分组名称。
   * @param {string} expressionName 表情名称。
   * @param {number} value 表情权重。
   * @returns {VRMExpressionController} 当前控制器实例。
   */
  setGroupValue(groupName, expressionName, value) {
    const nextValue = this.clamp ? clamp01(value) : value;
    const currentExpressionName = this.groupValues.get(groupName);

    if (currentExpressionName && currentExpressionName !== expressionName) {
      this.values.delete(currentExpressionName);
      this.expressionManager?.setValue(currentExpressionName, 0);
    }

    this.groupValues.set(groupName, expressionName);
    this.values.set(expressionName, nextValue);
    this.expressionManager?.setValue(expressionName, nextValue);
    return this;
  }

  /**
   * 设置嘴部表情。
   *
   * @param {string} expressionName 表情名称。
   * @param {number} value 表情权重。
   * @returns {VRMExpressionController} 当前控制器实例。
   */
  setMouthValue(expressionName, value) {
    return this.setGroupValue("mouth", expressionName, value);
  }

  /**
   * 设置眼部表情。
   *
   * @param {string} expressionName 表情名称。
   * @param {number} value 表情权重。
   * @returns {VRMExpressionController} 当前控制器实例。
   */
  setEyeValue(expressionName, value) {
    return this.setGroupValue("eye", expressionName, value);
  }

  /**
   * 批量设置表情权重。
   *
   * @param {Record<string, number>} values 表情名称到权重的映射。
   * @returns {VRMExpressionController} 当前控制器实例。
   */
  setValues(values) {
    for (const [expressionName, value] of Object.entries(values)) {
      this.setValue(expressionName, value);
    }

    return this;
  }

  /**
   * 获取当前缓存的表情权重。
   *
   * @param {string} expressionName 表情名称。
   * @returns {number} 表情权重。
   */
  getValue(expressionName) {
    return this.values.get(expressionName) ?? 0;
  }

  /**
   * 清空单个表情权重。
   *
   * @param {string} expressionName 表情名称。
   * @returns {VRMExpressionController} 当前控制器实例。
   */
  clearValue(expressionName) {
    const groupName = this.getGroupName(expressionName);
    if (groupName && this.groupValues.get(groupName) === expressionName) {
      this.groupValues.delete(groupName);
    }

    this.values.delete(expressionName);
    this.expressionManager?.setValue(expressionName, 0);
    return this;
  }

  /**
   * 清空指定分组内的当前表情。
   *
   * @param {string} groupName 分组名称。
   * @returns {VRMExpressionController} 当前控制器实例。
   */
  clearGroup(groupName) {
    const expressionName = this.groupValues.get(groupName);
    if (!expressionName) return this;

    this.groupValues.delete(groupName);
    this.values.delete(expressionName);
    this.expressionManager?.setValue(expressionName, 0);
    return this;
  }

  /**
   * 重置所有已控制的表情。
   *
   * @returns {VRMExpressionController} 当前控制器实例。
   */
  reset() {
    for (const expressionName of this.values.keys()) {
      this.expressionManager?.setValue(expressionName, 0);
    }

    this.values.clear();
    this.groupValues.clear();
    return this;
  }

  /**
   * 将缓存的表情值重新同步到 VRM。
   *
   * @returns {VRMExpressionController} 当前控制器实例。
   */
  sync() {
    for (const [expressionName, value] of this.values) {
      this.expressionManager?.setValue(expressionName, value);
    }

    return this;
  }

  /**
   * 释放控制器资源。
   *
   * @returns {void}
   */
  dispose() {
    this.reset();
    this.expressionManager = null;
    this.vrm = null;
  }
}

/**
 * 创建 VRM 表情控制器。
 *
 * @param {object|null} vrm 已加载的 VRM 实例。
 * @param {VRMExpressionControllerOptions} [options] 控制器配置项。
 * @returns {VRMExpressionController} VRM 表情控制器实例。
 */
export const createVRMExpressionController = (vrm, options) =>
  new VRMExpressionController(vrm, options);
