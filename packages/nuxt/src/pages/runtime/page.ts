import { Suspense, Transition, defineComponent, h, inject, nextTick, onMounted, ref } from 'vue'
import type { KeepAliveProps, TransitionProps, VNode } from 'vue'
import { RouterView } from '#vue-router'
import { defu } from 'defu'
import type { RouteLocationNormalized, RouteLocationNormalizedLoaded } from '#vue-router'

import type { RouterViewSlotProps } from './utils'
import { generateRouteKey, wrapInKeepAlive } from './utils'
import { RouteProvider } from '#app/components/route-provider'
import { useNuxtApp } from '#app/nuxt'
import { _wrapIf } from '#app/components/utils'
import { LayoutMetaSymbol, PageRouteSymbol } from '#app/components/injections'
// @ts-expect-error virtual file
import { appKeepalive as defaultKeepaliveConfig, appPageTransition as defaultPageTransition } from '#build/nuxt.config.mjs'

export default defineComponent({
  name: 'NuxtPage',
  inheritAttrs: false,
  props: {
    name: {
      type: String
    },
    transition: {
      type: [Boolean, Object] as any as () => boolean | TransitionProps,
      default: undefined
    },
    keepalive: {
      type: [Boolean, Object] as any as () => boolean | KeepAliveProps,
      default: undefined
    },
    route: {
      type: Object as () => RouteLocationNormalized
    },
    pageKey: {
      type: [Function, String] as unknown as () => string | ((route: RouteLocationNormalizedLoaded) => string),
      default: null
    }
  },
  setup (props, { attrs, expose }) {
    const nuxtApp = useNuxtApp()
    const pageRef = ref()
    const forkRoute = inject(PageRouteSymbol, null)

    expose({ pageRef })

    const _layoutMeta = inject(LayoutMetaSymbol, null)
    let vnode: VNode
    let componentVNode: VNode
    let trackRootNodes = false

    const done = nuxtApp.deferHydration()

    if (import.meta.dev && import.meta.client) {
      onMounted(() => {
        nextTick(() => {
          if (['#comment', '#text'].includes(vnode?.el?.nodeName) && trackRootNodes) {
            const filename = (componentVNode?.type as any).__file
            console.warn(`[nuxt] \`${filename}\` does not have a single root node and will cause errors when navigating between routes.`)
          }
        })
      })
    }

    return () => {
      return h(RouterView, { name: props.name, route: props.route, ...attrs }, {
        default: (routeProps: RouterViewSlotProps) => {
          const isRenderingNewRouteInOldFork = import.meta.client && haveParentRoutesRendered(forkRoute, routeProps.route, routeProps.Component)
          const hasSameChildren = import.meta.client && forkRoute && forkRoute.matched.length === routeProps.route.matched.length

          if (!routeProps.Component) {
            // If we're rendering a `<NuxtPage>` child route on navigation to a route which lacks a child page
            // we'll render the old vnode until the new route finishes resolving
            if (import.meta.client && vnode && !hasSameChildren) {
              return vnode
            }
            done()
            return
          }

          // Return old vnode if we are rendering _new_ page suspense fork in _old_ layout suspense fork
          if (import.meta.client && vnode && _layoutMeta && !_layoutMeta.isCurrent(routeProps.route)) {
            return vnode
          }

          if (import.meta.client && isRenderingNewRouteInOldFork && forkRoute && (!_layoutMeta || _layoutMeta?.isCurrent(forkRoute))) {
            // if leaving a route with an existing child route, render the old vnode
            if (hasSameChildren) {
              return vnode
            }
            // If _leaving_ null child route, return null vnode
            return null
          }

          const key = generateRouteKey(routeProps, props.pageKey)

          const hasTransition = !!(props.transition ?? routeProps.route.meta.pageTransition ?? defaultPageTransition)
          trackRootNodes = hasTransition
          const transitionProps = hasTransition && _mergeTransitionProps([
            props.transition,
            routeProps.route.meta.pageTransition,
            defaultPageTransition,
            { onAfterLeave: () => { nuxtApp.callHook('page:transition:finish', routeProps.Component) } }
          ].filter(Boolean))

          componentVNode = h(routeProps.Component, { ref: pageRef, key: key || undefined })
          vnode = h(RouteProvider, {
            route: routeProps.route,
            renderKey: key || undefined
          }, _wrapIf(
            Transition,
            hasTransition && transitionProps,
            wrapInKeepAlive(
              props.keepalive ?? routeProps.route.meta.keepalive ?? defaultKeepaliveConfig as KeepAliveProps,
              h(Suspense, {
                suspensible: true,
                key: key || undefined,
                onPending: () => nuxtApp.callHook('page:start', routeProps.Component),
                onResolve: () => {
                  nextTick(() => nuxtApp.callHook('page:finish', routeProps.Component).finally(done))
                }
              }, componentVNode)
            )
          ))

          return vnode
        }
      })
    }
  }
})

function _toArray (val: any) {
  return Array.isArray(val) ? val : (val ? [val] : [])
}

function _mergeTransitionProps (routeProps: TransitionProps[]): TransitionProps {
  const _props: TransitionProps[] = routeProps.map(prop => ({
    ...prop,
    onAfterLeave: _toArray(prop.onAfterLeave)
  }))
  return defu(..._props as [TransitionProps, TransitionProps])
}

function haveParentRoutesRendered (fork: RouteLocationNormalizedLoaded | null, newRoute: RouteLocationNormalizedLoaded, Component?: VNode) {
  if (!fork) { return false }

  const index = newRoute.matched.findIndex(m => m.components?.default === Component?.type)
  if (!index || index === -1) { return false }

  // we only care whether the parent route components have had to rerender
  return newRoute.matched.slice(0, index)
    .some(
      (c, i) => c.components?.default !== fork.matched[i]?.components?.default) ||
        (Component && generateRouteKey({ route: newRoute, Component }) !== generateRouteKey({ route: fork, Component }))
}
