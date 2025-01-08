import { ApiResponse, BookRoomDto, DeleteResponse, EventResponse, GetAvailableRoomsQueryDto, IConferenceRoom, StatusTypes } from '@quickmeet/shared';
import axios, { AxiosInstance } from 'axios';
import { toast } from 'react-hot-toast';
import { secrets } from '@config/secrets';
import { CacheService, CacheServiceFactory } from '@helpers/cache';
import { ROUTES } from '@/config/routes';
import { NavigateFunction } from 'react-router-dom';

/**
 * @description Serves as the base API endpoint for the application. It provides the authorization token in every request
 */
export default class Api {
  private static instance: Api;
  apiToken?: string;
  client: AxiosInstance;
  private navigate: NavigateFunction | undefined;

  cacheService: CacheService = CacheServiceFactory.getCacheService();

  constructor(navigate?: NavigateFunction) {
    this.client = axios.create({
      baseURL: secrets.backendEndpoint,
      timeout: secrets.nodeEnvironment === 'development' ? 1000000 : 10000,
      headers: this.getHeaders(),
    });

    this.navigate = navigate;
    this.handleTokenRefresh();
  }

  static getInstance(navigate: NavigateFunction): Api {
    if (!Api.instance) {
      Api.instance = new Api(navigate);
    }
    return Api.instance;
  }

  getHeaders() {
    return {
      Accept: 'application/json',
      'x-mock-api': secrets.mockCalender,
      'x-app-environment': secrets.appEnvironment, // can be either chrome or web
    };
  }

  async validateSession() {
    try {
      await this.client.get('/auth/session/validate');
      return true;
    } catch (error) {
      return false;
    }
  }

  async refreshToken() {
    try {
      const res = await axios.get('/auth/token/refresh', {
        baseURL: secrets.backendEndpoint,
        timeout: secrets.nodeEnvironment === 'development' ? 1000000 : 10000,
        headers: this.getHeaders(),
      });

      return res.data.data;
    } catch (error) {
      return null;
    }
  }

  async handleTokenRefresh() {
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        console.log(error);

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          const renewedToken = await this.refreshToken();
          if (!renewedToken) {
            await this.logout();

            this.navigate && this.navigate(ROUTES.signIn);
            return Promise.reject(error);
          }

          return this.client(originalRequest);
        }

        return Promise.reject(error);
      },
    );
  }

  async getOAuthUrl() {
    try {
      const { data } = await this.client.get('/auth/oauth2/url');
      return this.createReply('success', '', data.data) as ApiResponse<string>;
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  async handleOAuthCallback(code: string) {
    try {
      const payload = {
        code,
      };

      await this.client.post('/auth/oauth2/callback', payload);
      return this.createReply() as ApiResponse<boolean>;
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  async logout() {
    try {
      await this.client.post('/auth/logout', null);
      return true;
    } catch (error: any) {
      return false;
    }
  }

  async loginChrome() {
    const { data } = await this.getOAuthUrl();
    if (data) {
      return await this.handleChromeOauthFlow(data);
    }
    return this.createReply('error');
  }

  async login() {
    const { data } = await this.getOAuthUrl();
    if (!data) {
      toast.error('Failed to retrieve oauth callback url');
      return;
    }

    window.location.href = data;
  }

  async handleChromeOauthFlow(authUrl: string) {
    return await new Promise<ApiResponse<any>>((resolve, _) => {
      chrome.runtime.sendMessage({ type: 'startAuthFlow', redirectUrl: authUrl }, async (response) => {
        if (!response.success) {
          return resolve(this.createReply('error', response.error));
        }

        const res = await this.handleOAuthCallback(response.code);
        if (res.status === 'error') {
          return resolve(this.createReply('error', res?.message || 'Something went wrong'));
        }

        return resolve(this.createReply('success', 'OAuth flow completed'));
      });
    });
  }

  async getAvailableRooms(signal: AbortSignal, startTime: string, duration: number, timeZone: string, seats: number, floor?: string, eventId?: string) {
    try {
      const params: GetAvailableRoomsQueryDto = { startTime, duration, timeZone, seats, floor, eventId };
      const res = await this.client.get('/api/rooms/available', { params, signal });

      return res.data as ApiResponse<IConferenceRoom[]>;
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  async getRooms(startTime: string, endTime: string, timeZone: string) {
    try {
      const res = await this.client.get('/api/events', {
        params: {
          startTime,
          endTime,
          timeZone,
        },
      });

      return res.data as ApiResponse<EventResponse[]>;
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  async createEvent(payload: BookRoomDto) {
    try {
      const res = await this.client.post('/api/event', payload);

      return res.data as ApiResponse<EventResponse>;
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  async updateEvent(eventId: string, payload: BookRoomDto) {
    try {
      const res = await this.client.put('/api/event', { eventId, ...payload });

      return res.data as ApiResponse<EventResponse>;
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  async deleteEvent(eventId: string) {
    try {
      const res = await this.client.delete(`/api/event?id=${eventId}`);

      return res.data as ApiResponse<DeleteResponse>;
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  async getMaxSeatCount(): Promise<ApiResponse<number>> {
    try {
      const res = await this.client.get('/api/rooms/highest-seat-count');

      return res.data as ApiResponse<number>;
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  async getFloors() {
    try {
      const res = await this.client.get('/api/floors');

      return res.data as ApiResponse<string[]>;
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  createReply(status: StatusTypes = 'success', message?: string, data?: any): ApiResponse<any> {
    return { status, message, data };
  }

  handleError(error: any) {
    console.error(error);
    // used for Abort request controllers
    if (error.code === 'ERR_CANCELED') {
      return this.createReply('ignore', 'Pending request aborted', null);
    }

    const res: ApiResponse<any> = error?.response?.data;
    console.log(res);

    if (res) {
      console.error(res);
      return res;
    }

    return this.createReply('error', 'Something went wrong', null);
  }
}
