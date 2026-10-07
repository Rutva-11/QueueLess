import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

const apiClient = axios.create({
    baseURL: BASE_URL,
    headers: { "Content-Type": "application/json" },
    timeout: 10000
});

// Attach JWT from localStorage on every request
apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem("token") || localStorage.getItem("ql_token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Auth endpoints
export const authAPI = {
    checkIn: (data) => apiClient.post("/auth/customer/check-in", data),
    register: (data) => apiClient.post("/auth/register", data),
    login: (data) => apiClient.post("/auth/login", data)
};

// Queue endpoints
export const queueAPI = {
    services: () => apiClient.get("/queue/services"),
    join: (serviceId) => apiClient.post("/queue/join", { serviceId }),
    myEntry: () => apiClient.get("/queue/my"),
    serviceQueue: (serviceId) => apiClient.get(`/queue/service/${serviceId}`),
    callNext: (serviceId) => apiClient.post("/queue/call-next", { serviceId }),
    startServing: (entryId) => apiClient.post(`/queue/${entryId}/start`),
    complete: (entryId) => apiClient.post(`/queue/${entryId}/complete`),
    cancel: (entryId) => apiClient.post(`/queue/${entryId}/cancel`)
};

export default apiClient;
