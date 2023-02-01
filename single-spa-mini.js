// 实现子应用的注册，挂载 切换 卸载

// 子应用的一些状态
// 子应用注册以后初始状态
const NOT_LOADED = 'NOT_LOADED'
// 表示正在加载子应用源代码
const LOADING_SOURCE_CODE = 'LOADING_SOURCE_CODE'
// 执行完app.loadApp, 及子应用加载完以后的状态
const NOT_BOOTSTRAPPED = 'NOT_BOOTSTRAPPED'
// 正在初始化
const BOOTSTRAPPING = 'BOOTSTRAPPING'
// 执行完app.bootstrap之后的状态，是初始化，还未挂载
const NOT_MOUNTED = 'NOT_MOUNTED'
// 正在挂载
const MOUNTING = 'MOUNTING'
// 执行完app.mount执行完毕
const MOUNTED = 'MOUNTED '
const UPDATING = 'UPDATING'
// 正在卸载
const UNMOUNTING = 'UNMOUNTING'

// 以下三种状态这里没有涉及
const UNLOADING = 'UNLOADING'
const LOAD_ERROR = 'LOAD_ERROR'
const SKIP_BECAUSE_BROKEN = 'SKIP_BECAUSE_BROKEN'

/**
 * 注册子应用
 * @param {*} appConfig = {
 *    name: '',
 *    app: promise function,
 *    activeWhen: location => location.pathname.startsWith(path),
 *    customProps: {}
 * }
 */
//存放所有的应用
const apps = []

// 注册应用的入口
export function registerApplication(appConfig) {
  apps.push(Object.assign({}, appConfig, { status: NOT_LOADED}))
  reroute()
}

// 启动
let isStarted = false
export function start() {
  isStarted = true
}
function reroute() {
  // 三类app : 加载  挂载 卸载
  const {
    appsToLoad,
    appsToMount,
    appsToUnmount
  } = getAppChanges()

  if(isStarted) {
    // 执行过的话就是走切换
    performAppChanges()
  }else {
    // 否则去走加载
    loadApps()
  }

  function performAppChanges() {
    // 先卸载
    appsToUnmount.map(toUnMount)
    // 再去加载  挂载
    appsToMount.map(tryToBoostrapAndMount)  
  }
  
  function loadApps() {
    appsToLoad.map(toLoad)
  }
}

// 其实加载 挂载 卸载 本质就是去改变app的status
// 加载应用
async function toLoad(app) {
  if(app.status !== 'NOT_LOADED')  return app
  // 更改状态
  app.status = LOADING_SOURCE_CODE
  // 加载app
  const res = await app.app()
  // 加载完成
  app.status = NOT_BOOTSTRAPPED
  // 把子应用的生命周期挂载到app对象上
  app.bootstrap = res.bootstrap
  app.mount = res.mount
  app.unmount = res.mount
  app.onload = res.onload
  // 加载完之后执行reroute函数
  reroute()
  return app
}

// 卸载应用
async function toUnMount(app) {
  if (app.status !== 'MOUNTED') return app
  app.status = UNMOUNTING
  await app.unmount(app.customProps)
  app.status = NOT_MOUNTED
  return app
}


// 挂载应用
async function tryToBoostrapAndMount(app) {
  if(shouldBeActive(app)) {
    app.status = BOOTSTRAPPING
    // 初始化
    await app.bootstrap(app.customProps)
    app.status = NOT_MOUNTED
    // 开始执行挂载
    // 二次判断  --> 防止中途用户切换路由
    if(shouldBeActive(app)) {
      app.status = MOUNTING
      await app.mount(app.customProps)
      app.status = MOUNTED
    }
  }
}

function getAppChanges() {
  // 三类应用：去加载  去挂载  去卸载
  const appsToLoad = [],
    appsToMount = [],
    appsToUnmount = []

  // 这里将push到apps数组中的应用去遍历
  // 分到不同的类别里面
  apps.forEach(app => {
    switch (app.status) {
      // 待加载
      case NOT_LOADED:
        appsToLoad.push(app)
      break
      // 待挂载
      case NOT_BOOTSTRAPPED:
      case NOT_MOUNTED:
        appsToMount.push(app)
      break
      // 待卸载
      case MOUNTED: 
        appsToUnmount.push(app)
      break
    }
  })

  return { appsToLoad, appsToMount, appsToUnmount}
}

// 判断应用是否该激活？？？
function shouldBeActive(app) {
  try {
    // 用户设置的路由与当前地址栏的路由一致的时候，才能激活
    return app.activeWhen(window.location)
  } catch (err) {
    console.log("不能激活")
    return false
  }
}

// 让子应用判断自己是否运行在基座应用中
window.singleSpaNavigate = true
// 监听路由
window.addEventListener('hashchange', reroute)
window.history.pushState = patchedUpdateState(window.history.pushState)
window.history.replaceState = patchedUpdateState(window.history.replaceState)

// 增强原生方法
function patchedUpdateState(updateState) {
  return function(...args) {
    // 当前url
    const urlBefore = window.location.href
    // 执行结果
    const result = Reflect.apply(updateState, this, args)
    // 执行完之后的路由
    const urlAfter = window.location.href
    if(urlBefore !== urlAfter) {
      reroute()
    }
    return result
  }
}



