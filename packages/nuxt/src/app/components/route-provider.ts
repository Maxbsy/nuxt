import { defineComponent, nextTick, onMounted, provide, shallowReactive } from 'vue'
import type { VNode } from 'vue'
import type { RouteLocation, RouteLocationNormalizedLoaded } from '#vue-router'
import { PageRouteSymbol } from './injections'

export const RouteProvider = defineComponent({
  name: 'RouteProvider',
  props: {
    vnode: {
      type: Object as () => VNode,
      required: true
    },
    route: {
      type: Object as () => RouteLocationNormalizedLoaded,
      required: true
    },
    renderKey: String,
    trackRootNodes: Boolean
  },
  setup (props, { slots }) {
    // Prevent reactivity when the page will be rerendered in a different suspense fork
    const previousKey = props.renderKey
    const previousRoute = props.route

    // Provide a reactive route within the page
    const route = {} as RouteLocation
    for (const key in props.route) {
      Object.defineProperty(route, key, {
        get: () => previousKey === props.renderKey ? props.route[key as keyof RouteLocationNormalizedLoaded] : previousRoute[key as keyof RouteLocationNormalizedLoaded]
      })
    }

    provide(PageRouteSymbol, shallowReactive(route))

    if (import.meta.dev && import.meta.client && props.trackRootNodes) {
      onMounted(() => {
        nextTick(() => {
          if (['#comment', '#text'].includes(props.vnode?.el?.nodeName)) {
            const filename = (props.vnode?.type as any).__file
            console.warn(`[nuxt] \`${filename}\` does not have a single root node and will cause errors when navigating between routes.`)
          }
        })
      })
    }

    return () => slots.default && slots.default()
  }
})
