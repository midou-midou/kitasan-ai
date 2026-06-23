const VRMA_URL_MODULES = import.meta.glob("../assets/motions/vrma/*.vrma", {
  eager: true,
  query: "?url",
  import: "default",
});

/**
 * 从资源路径中提取文件名。
 *
 * @param {string} path VRMA 资源路径。
 * @returns {string} 文件名，包含扩展名。
 */
const getFileName = (path) => path.split("/").at(-1);

/**
 * 从资源路径中提取动作名。
 *
 * @param {string} path VRMA 资源路径。
 * @returns {string} 动作名，和文件名去掉 `.vrma` 后保持一致。
 */
const getActionName = (path) => getFileName(path).replace(/\.vrma$/i, "");

/**
 * 根据 Vite 收集到的 VRMA URL 模块生成动作配置条目。
 *
 * @returns {Array<[string, {fileName: string, label: string, url: string}]>} 动作配置条目列表。
 */
const createActionEntries = () =>
  Object.entries(VRMA_URL_MODULES)
    .map(([path, url]) => {
      const fileName = getFileName(path);
      const actionName = getActionName(path);

      return [actionName, { fileName, label: actionName, url }];
    })
    .sort(([actionNameA], [actionNameB]) => actionNameA.localeCompare(actionNameB));

/**
 * VRMA 动作类型映射。
 *
 * @type {Record<string, {fileName: string, label: string, url: string}>}
 */
export const VRMA_ACTIONS_TYPES = Object.fromEntries(createActionEntries());

/**
 * VRMA 动作配置映射别名。
 *
 * @type {typeof VRMA_ACTIONS_TYPES}
 */
export const VRMA_ACTIONS = VRMA_ACTIONS_TYPES;
