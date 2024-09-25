import { OAuth2Client } from 'google-auth-library';
import { admin_directory_v1, calendar_v3, oauth2_v2 } from 'googleapis';
import { OAuthTokenResponse } from '../../auth/dto/oauth-token.response';
import { User } from '../../auth/entities';
export interface IGoogleApiService {
  getOAuthClient(redirectUrl: string): OAuth2Client;
  getOAuthClient(redirectUrl: string, user?: User): OAuth2Client;
  getToken(oauth2Client: OAuth2Client, code: string): Promise<OAuthTokenResponse>;
  getUserInfo(oauth2Client: OAuth2Client): Promise<oauth2_v2.Schema$Userinfo>;

  createCalenderEvent(oauth2Client: OAuth2Client, event: calendar_v3.Schema$Event): Promise<calendar_v3.Schema$Event>;
  getCalendarResources(oauth2Client: OAuth2Client): Promise<admin_directory_v1.Schema$CalendarResources>;
  getCalenderSchedule(oauth2Client: OAuth2Client, start: string, end: string, timeZone: string, rooms: string[]): Promise<calendar_v3.Schema$FreeBusyCalendar>;
  getCalenderEvents(oauth2Client: OAuth2Client, start: string, end: string, timeZone: string, limit?: number): Promise<calendar_v3.Schema$Event[]>;
  getCalenderEvent(oauth2Client: OAuth2Client, id: string): Promise<calendar_v3.Schema$Event>;
  updateCalenderEvent(oauth2Client: OAuth2Client, id: string, event: calendar_v3.Schema$Event): Promise<calendar_v3.Schema$Event>;
  deleteEvent(oauth2Client: OAuth2Client, id: string): Promise<void>;
}
