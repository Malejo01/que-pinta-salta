// Cliente de Supabase para la app (R24). `react-native-url-polyfill/auto` va
// primero porque `supabase-js` lo necesita en React Native (URL/URLSearchParams).
import 'react-native-url-polyfill/auto'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { AppState, type AppStateStatus } from 'react-native'
// Import de solo tipos: se borra en la compilación, no hace falta que Metro
// resuelva @qps/db en el bundle.
import type { Database } from '@qps/db'
import { leerEnv } from './env'
import { fetchConTimeout, TIMEOUT_RED_MS } from './red'
import { getItem, removeItem, setItem } from './secure-storage'

const { supabase: configuracionSupabase } = leerEnv()

/**
 * `null` si falta `EXPO_PUBLIC_SUPABASE_URL` o `EXPO_PUBLIC_SUPABASE_ANON_KEY`:
 * la app sigue andando sin login (el login es opcional en la R24).
 */
export const supabase: SupabaseClient<Database> | null = configuracionSupabase
  ? createClient<Database>(configuracionSupabase.url, configuracionSupabase.anonKey, {
      auth: {
        storage: { getItem, setItem, removeItem },
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
      // Timeout de red (28-a): sin esto, una llamada que nunca responde deja
      // a la app "cargando" para siempre. El error del corte llega a las
      // pantallas como cualquier error de red.
      global: { fetch: fetchConTimeout(fetch, TIMEOUT_RED_MS) },
    })
  : null

// El refresco automático del token solo corre mientras la app está en
// primer plano (lo recomienda la guía de Supabase para React Native).
if (supabase) {
  AppState.addEventListener('change', (estado: AppStateStatus) => {
    if (estado === 'active') {
      void supabase.auth.startAutoRefresh()
    } else {
      void supabase.auth.stopAutoRefresh()
    }
  })
}
