import axios from 'axios'

const baseURL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

const api = axios.create({
  baseURL: baseURL || undefined,
})

export default api
