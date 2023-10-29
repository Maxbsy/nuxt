import { defineComponent, provide, shallowReactive, watch } from 'vue'
import type { RouteLocation, RouteLocationNormalizedLoaded } from '#vue-router'
import { PageRouteSymbol } from './injections'

export const RouteProvider = defineComponent({
  name: 'RouteProvider',
  props: {
    route: {
      type: Object as () => RouteLocationNormalizedLoaded,
      required: true
    },
    renderKey: String
  },
  setup (props, { slots }) {
    // Prevent reactivity when the page will be rerendered in a different suspense fork
    let previousKey = props.renderKey
    let previousRoute = props.route

    // Provide a reactive route within the page
    const route = {} as RouteLocation
    for (const key in props.route) {
      Object.defineProperty(route, key, {
        get: () => {
          return previousKey === props.renderKey ? props.route[key as keyof RouteLocationNormalizedLoaded] : previousRoute[key as keyof RouteLocationNormalizedLoaded]
        }
      })
    }

    watch(() => props.renderKey, (newKey, oldKey) => {
      if (newKey !== oldKey) {
        previousKey = props.renderKey
        previousRoute = props.route
      }
    }, { flush: 'sync' })

    provide(PageRouteSymbol, shallowReactive(route))

    return () => slots.default && slots.default()[0]
  }
})
