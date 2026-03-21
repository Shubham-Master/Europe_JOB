import axios from 'axios'
import { supabase } from './supabase'

const baseURL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

const api = axios.create({
  baseURL: baseURL || undefined,
})

api.interceptors.request.use(async (config) => {
  if (!supabase) {
    return config
  }

  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token

  if (accessToken) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${accessToken}`
  }

  return config
})

export default api
