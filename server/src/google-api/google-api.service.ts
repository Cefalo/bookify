import { ConflictException, ForbiddenException, HttpStatus, Inject, Injectable, NotFoundException, NotImplementedException } from '@nestjs/common';
import { admin_directory_v1, calendar_v3, google, oauth2_v2 } from 'googleapis';
import { IGoogleApiService } from './interfaces/google-api.interface';
import { OAuthTokenResponse } from '../auth/dto/oauth-token.response';
import { OAuth2Client } from 'google-auth-library';
import appConfig from 'src/config/env/app.config';
import { ConfigType } from '@nestjs/config';
import to from 'await-to-js';
import { GaxiosError, GaxiosResponse } from 'gaxios';
import { GoogleAPIErrorMapper } from 'src/helpers/google-api-error.mapper';
import { User } from '../auth/entities';

@Injectable()
export class GoogleApiService implements IGoogleApiService {
  constructor(@Inject(appConfig.KEY) private config: ConfigType<typeof appConfig>) {
    console.log('googgle api service: ', config);
  }

  // @ overloaded method signature
  getOAuthClient(redirectUrl: string, user: User): OAuth2Client;
  getOAuthClient(redirectUrl: string): OAuth2Client;
  getOAuthClient(redirectUrl: string, user?: User): OAuth2Client {
    if (!user) {
      return new google.auth.OAuth2(this.config.oAuthClientId, this.config.oAuthClientSecret, redirectUrl);
    } else {
      const client = new google.auth.OAuth2(this.config.oAuthClientId, this.config.oAuthClientSecret, redirectUrl);
      const { accessToken, scope, tokenType, expiryDate, idToken, refreshToken } = user.auth;
      client.setCredentials({
        access_token: accessToken,
        scope: scope,
        token_type: tokenType,
        expiry_date: expiryDate,
        id_token: idToken,
        refresh_token: refreshToken,
      });

      return client;
    }
  }

  async getToken(oauth2Client: OAuth2Client, code: string): Promise<OAuthTokenResponse> {
    const [err, response]: [GaxiosError, OAuthTokenResponse] = await to(oauth2Client.getToken(code));

    if (err) {
      GoogleAPIErrorMapper.handleError(err);
    }

    oauth2Client.setCredentials(response.tokens);

    return response as OAuthTokenResponse;
  }

  async getUserInfo(oauth2Client: OAuth2Client): Promise<oauth2_v2.Schema$Userinfo> {
    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2',
    });

    const { data } = await oauth2.userinfo.get();
    return data;
  }

  async getCalendarResources(oauth2Client: OAuth2Client) {
    const service = google.admin({ version: 'directory_v1', auth: oauth2Client });
    const options = { customer: 'my_customer' };

    const [err, res]: [GaxiosError, GaxiosResponse<admin_directory_v1.Schema$CalendarResources>] = await to(service.resources.calendars.list(options));

    if (err) {
      GoogleAPIErrorMapper.handleError(err, (status: HttpStatus) => {
        if (status === HttpStatus.NOT_FOUND) {
          throw new NotFoundException('No directory resources found. Are you using an organization account?');
        }
      });
    }

    if (res.status !== 200) {
      throw new NotFoundException("Couldn't obtain directory resources");
    }

    return res.data;
  }

  async createCalenderEvent(oauth2Client: OAuth2Client, event: calendar_v3.Schema$Event) {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const [err, result]: [GaxiosError, GaxiosResponse<calendar_v3.Schema$Event>] = await to(
      calendar.events.insert({
        calendarId: 'primary',
        conferenceDataVersion: 1,
        requestBody: {
          ...event,
        },
      }),
    );

    if (err) {
      GoogleAPIErrorMapper.handleError(err);
    }

    if (result.status !== 200) {
      throw new ConflictException("Couldn't book room. Please try again later.");
    }

    return result.data;
  }

  async getCalenderSchedule(
    oauth2Client: OAuth2Client,
    start: string,
    end: string,
    timeZone: string,
    rooms: string[],
  ): Promise<{
    [key: string]: calendar_v3.Schema$FreeBusyCalendar;
  }> {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const [err, roomsFreeBusy]: [GaxiosError, GaxiosResponse<calendar_v3.Schema$FreeBusyResponse>] = await to(
      calendar.freebusy.query({
        requestBody: {
          timeMin: start,
          timeMax: end,
          timeZone,
          items: rooms.map((email) => {
            return {
              id: email,
            };
          }),
        },
      }),
    );

    if (err) {
      GoogleAPIErrorMapper.handleError(err);
    }

    return roomsFreeBusy.data.calendars;
  }

  async getCalenderEvent(oauth2Client: OAuth2Client, id: string): Promise<calendar_v3.Schema$Event> {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const [err, res]: [GaxiosError, GaxiosResponse<calendar_v3.Schema$Event>] = await to(
      calendar.events.get({
        eventId: id,
        calendarId: 'primary',
      }),
    );

    if (err) {
      GoogleAPIErrorMapper.handleError(err);
    }

    return res.data;
  }

  async getCalenderEvents(oauth2Client: OAuth2Client, start: string, end: string, timeZone: string, limit: number = 30): Promise<calendar_v3.Schema$Event[]> {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const [err, result]: [GaxiosError, GaxiosResponse<calendar_v3.Schema$Events>] = await to(
      calendar.events.list({
        calendarId: 'primary',
        timeMin: start,
        timeMax: end,
        timeZone,
        maxResults: limit,
        singleEvents: true,
        orderBy: 'startTime',
      }),
    );

    if (err) {
      GoogleAPIErrorMapper.handleError(err);
    }

    return result.data.items;
  }

  async updateCalenderEvent(oauth2Client: OAuth2Client, id: string, event: calendar_v3.Schema$Event): Promise<calendar_v3.Schema$Event> {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const [err, res]: [GaxiosError, GaxiosResponse<calendar_v3.Schema$Event>] = await to(
      calendar.events.update({
        eventId: id,
        calendarId: 'primary',
        requestBody: event,
      }),
    );

    if (err) {
      GoogleAPIErrorMapper.handleError(err);
    }

    if (res.status !== 200) {
      throw new ForbiddenException('Could not update the event at this moment');
    }

    return res.data;
  }

  async deleteEvent(oauth2Client: OAuth2Client, id: string): Promise<void> {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const [err, _]: [GaxiosError, GaxiosResponse<void>] = await to(
      calendar.events.delete({
        calendarId: 'primary',
        eventId: id,
      }),
    );

    if (err) {
      GoogleAPIErrorMapper.handleError(err);
    }
  }
}
