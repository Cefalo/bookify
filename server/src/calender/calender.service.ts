import { OAuth2Client } from 'google-auth-library';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { calendar_v3 } from 'googleapis';
import { extractRoomByEmail, isRoomAvailable, validateEmail } from './util/calender.util';
import { AuthService } from '../auth/auth.service';
import { DeleteResponse, EventResponse, EventUpdateResponse, IConferenceRoom, IAttendeeInformation } from '@quickmeet/shared';
import { GoogleApiService } from 'src/google-api/google-api.service';

@Injectable()
export class CalenderService {
  constructor(
    private authService: AuthService,
    @Inject('GoogleApiService') private readonly googleApiService: GoogleApiService,
  ) {}

  async createEvent(
    client: OAuth2Client,
    domain: string,
    startTime: string,
    endTime: string,
    room: string,
    organizerEmail: string,
    createConference?: boolean,
    eventTitle?: string,
    attendees?: string[],
  ): Promise<EventResponse> {
    const rooms = await this.authService.getDirectoryResources(client, domain);

    const attendeeList = [];
    if (attendees?.length) {
      for (const attendee of attendees) {
        if (validateEmail(attendee)) {
          attendeeList.push({ email: attendee });
        } else {
          throw new BadRequestException('Invalid attendee email provided: ' + attendee);
        }
      }
    }

    let conference = {};
    if (createConference) {
      conference = {
        conferenceData: {
          createRequest: {
            requestId: Math.random().toString(36).substring(7),
            conferenceSolutionKey: {
              type: 'hangoutsMeet',
            },
          },
        },
      };
    }

    const pickedRoom = extractRoomByEmail(rooms, room);
    if (!pickedRoom) {
      throw new NotFoundException('Incorrect room picked!');
    }

    const isAvailable = await this.isRoomAvailable(client, startTime, endTime, pickedRoom.email);
    if (!isAvailable) {
      throw new ConflictException('Room has already been booked.');
    }

    const event: calendar_v3.Schema$Event = {
      summary: eventTitle?.trim() || '-',
      location: pickedRoom.name,
      description: 'A quick meeting created by Quick Meet',
      start: {
        dateTime: startTime,
      },
      end: {
        dateTime: endTime,
      },
      attendees: [...attendeeList, { email: pickedRoom.email }, { email: organizerEmail, organizer: true, responseStatus: 'accepted' }],
      colorId: '3',
      extendedProperties: {
        private: {
          createdAt: new Date().toISOString(), // Adding custom createdAt timestamp
        },
      },
      ...conference,
    };

    const createdEvent = await this.googleApiService.createCalenderEvent(client, event);

    console.log('Room has been booked', createdEvent);

    const data: EventResponse = {
      eventId: createdEvent.id,
      summary: createdEvent.summary,
      meet: createdEvent.hangoutLink,
      start: createdEvent.start.dateTime,
      end: createdEvent.end.dateTime,
      room: pickedRoom.name,
      roomEmail: pickedRoom.email,
      roomId: pickedRoom.id,
      seats: pickedRoom.seats,
      isEditable: true,
      floor: pickedRoom.floor,
    };

    return data;
  }

  async getHighestSeatCapacity(client: OAuth2Client, domain: string): Promise<number> {
    const rooms = await this.authService.getDirectoryResources(client, domain);
    let max = -1;
    for (const room of rooms) {
      if (room.seats > max) {
        max = room.seats;
      }
    }

    return max;
  }

  async getAvailableRooms(
    client: OAuth2Client,
    domain: string,
    start: string,
    end: string,
    timeZone: string,
    minSeats: number,
    floor?: string,
    eventId?: string,
  ): Promise<IConferenceRoom[]> {
    const filteredRoomEmails: string[] = [];
    const rooms = await this.authService.getDirectoryResources(client, domain);
    for (const room of rooms) {
      if (room.seats >= Number(minSeats) && (floor === undefined || floor === '' || room.floor === floor)) {
        filteredRoomEmails.push(room.email);
      }
    }

    if (filteredRoomEmails.length === 0) {
      return [];
    }

    const calenders = await this.googleApiService.getCalenderSchedule(client, start, end, timeZone, filteredRoomEmails);

    const availableRooms: IConferenceRoom[] = [];
    let room: IConferenceRoom = null;

    for (const roomEmail of Object.keys(calenders)) {
      const isAvailable = isRoomAvailable(calenders[roomEmail].busy, new Date(start), new Date(end));
      if (isAvailable) {
        room = rooms.find((room) => room.email === roomEmail);
        availableRooms.push(room);
      }
    }

    if (eventId) {
      const event = await this.googleApiService.getCalenderEvent(client, eventId);
      const roomEmail = (event.attendees || []).find((attendee) => attendee.resource && attendee.responseStatus !== 'declined');

      if (roomEmail) {
        const currentStartTime = new Date(event.start.dateTime).getTime();
        const currentEndTime = new Date(event.end.dateTime).getTime();

        const requestStart = new Date(start).getTime();
        const requestEnd = new Date(end).getTime();

        const currentRoom = extractRoomByEmail(rooms, roomEmail.email);

        const { timeZone } = event.start;

        let isEventRoomAvailable = true;
        if (requestStart < currentStartTime) {
          const isAvailable = await this.isRoomAvailable(client, start, event.start.dateTime, roomEmail.email, timeZone);
          if (!isAvailable) {
            isEventRoomAvailable = false;
          }
        }

        if (requestEnd > currentEndTime) {
          const isAvailable = await this.isRoomAvailable(client, event.end.dateTime, end, roomEmail.email, timeZone);
          if (!isAvailable) {
            isEventRoomAvailable = false;
          }
        }

        if (isEventRoomAvailable) {
          availableRooms.unshift(currentRoom);
        }
      }
    }

    return availableRooms;
  }

  async isRoomAvailable(client: OAuth2Client, start: string, end: string, roomEmail: string, timeZone?: string): Promise<boolean> {
    const calenders = await this.googleApiService.getCalenderSchedule(client, start, end, timeZone, [roomEmail]);

    const availableRooms: IConferenceRoom[] = [];
    let room: IConferenceRoom = null;

    for (const roomEmail of Object.keys(calenders)) {
      const isAvailable = isRoomAvailable(calenders[roomEmail].busy, new Date(start), new Date(end));
      if (isAvailable) {
        availableRooms.push(room);
      }
    }

    if (availableRooms.length === 0) {
      return false;
    }

    return true;
  }

  async getEvents(client: OAuth2Client, domain: string, startTime: string, endTime: string, timeZone: string, userEmail: string): Promise<EventResponse[]> {
    const rooms = await this.authService.getDirectoryResources(client, domain);
    const events = await this.googleApiService.getCalenderEvents(client, startTime, endTime, timeZone);

    const formattedEvents = [];

    for (const event of events) {
      let room: IConferenceRoom | null = null;

      let attendees: string[] = [];
      if (event.attendees) {
        for (const attendee of event.attendees) {
          if (!attendee.resource && attendee.responseStatus !== 'declined' && !attendee.organizer) {
            attendees.push(attendee.email);
          } else if (attendee.resource) {
            room = rooms.find((_room) => _room.email === attendee.email);
          }
        }
      }

      if (!room && event.location) {
        // event location must be an external link
        event.hangoutLink = event.location;
      }

      const _event: EventResponse = {
        meet: event.hangoutLink,
        room: room?.name,
        roomEmail: room?.email,
        eventId: event.id,
        seats: room?.seats,
        floor: room?.floor,
        summary: event.summary,
        start: event.start.dateTime,
        attendees: attendees,
        end: event.end.dateTime,
        createdAt: event.extendedProperties?.private?.createdAt ? new Date(event.extendedProperties.private.createdAt).getTime() : Date.now(),
        isEditable: event.organizer.email === userEmail,
      };

      formattedEvents.push(_event);
    }

    const sortedEvents = formattedEvents.sort((a, b) => {
      const startA = new Date(a.start).getTime();
      const startB = new Date(b.start).getTime();
      if (startA !== startB) {
        return startA - startB;
      }
      const createdAtA = new Date(a.createdAt).getTime();
      const createdAtB = new Date(b.createdAt).getTime();
      const timestamps = [createdAtA, createdAtB];
      const firstCreated = Math.min(...timestamps);
      return firstCreated === createdAtA ? 1 : -1;
    });

    return sortedEvents;
  }

  async updateEvent(
    client: OAuth2Client,
    domain: string,
    eventId: string,
    startTime: string,
    endTime: string,
    userEmail: string,
    createConference?: boolean,
    eventTitle?: string,
    attendees?: string[],
    room?: string,
  ): Promise<EventUpdateResponse> {
    const event = await this.googleApiService.getCalenderEvent(client, eventId);
    const rooms = await this.authService.getDirectoryResources(client, domain);

    if (event.organizer.email !== userEmail) {
      throw new ForbiddenException('Not allowed to update this event');
    }

    const pickedRoom = extractRoomByEmail(rooms, room);
    if (!pickedRoom) {
      throw new NotFoundException('Incorrect room picked!');
    }

    // if selected room email is same as event's room
    if (event.attendees?.some((attendee) => attendee.email === room)) {
      const currentStartTime = new Date(event.start.dateTime).getTime();
      const currentEndTime = new Date(event.end.dateTime).getTime();

      const newStartTime = new Date(startTime).getTime();
      const newEndTime = new Date(endTime).getTime();

      const { timeZone } = event.start;

      if (newStartTime < currentStartTime) {
        const isAvailable = await this.isRoomAvailable(client, startTime, event.start.dateTime, room, timeZone);
        if (!isAvailable) {
          throw new ConflictException('Room is not available within the set duration');
        }
      }

      if (newEndTime > currentEndTime) {
        const isAvailable = await this.isRoomAvailable(client, event.end.dateTime, endTime, room, timeZone);
        if (!isAvailable) {
          throw new ConflictException('Room is not available within the set duration');
        }
      }
    }

    if (pickedRoom) {
      attendees.push(pickedRoom.email);
    }

    attendees.push(event.organizer.email);

    const attendeeList = [];
    if (attendees?.length) {
      for (const attendee of attendees) {
        if (validateEmail(attendee)) {
          const existingAttendee = event.attendees?.find((a) => a.email === attendee);
          if (existingAttendee) {
            attendeeList.push(existingAttendee);
          } else {
            attendeeList.push({ email: attendee });
          }
        } else {
          throw new BadRequestException('Invalid attendee email provided: ' + attendee);
        }
      }
    }

    let conference = {};
    if (createConference) {
      conference = {
        conferenceData: {
          createRequest: {
            requestId: Math.random().toString(36).substring(7),
            conferenceSolutionKey: {
              type: 'hangoutsMeet',
            },
          },
        },
      };
    } else {
      conference = {
        conferenceData: null,
      };
    }

    const updatedEvent: calendar_v3.Schema$Event = {
      ...event,
      summary: eventTitle?.trim() || '-',
      location: pickedRoom.name,
      description: 'A quick meeting created by Quick Meet',
      start: {
        dateTime: startTime,
      },
      end: {
        dateTime: endTime,
      },
      attendees: [...attendeeList, { email: pickedRoom.email }],
      colorId: '3',
      extendedProperties: {
        private: {
          createdAt: new Date().toISOString(), // Adding custom createdAt timestamp to order events
        },
      },
      ...conference,
    };

    const result = await this.googleApiService.updateCalenderEvent(client, eventId, updatedEvent);
    const attendeeEmails = result.attendees
      .filter((attendee) => !attendee.email.endsWith('resource.calendar.google.com') && !attendee.organizer)
      .map((attendee) => attendee.email);

    console.log('Room has been updated', result);

    const eventResponse: EventResponse = {
      eventId: updatedEvent.id,
      summary: updatedEvent.summary,
      meet: result.hangoutLink,
      start: updatedEvent.start.dateTime,
      end: updatedEvent.end.dateTime,
      room: pickedRoom.name,
      roomEmail: pickedRoom.email,
      roomId: pickedRoom.id,
      seats: pickedRoom.seats,
      attendees: attendeeEmails,
      isEditable: true,
      floor: pickedRoom.floor,
    };

    return eventResponse;
  }

  async deleteEvent(client: OAuth2Client, id: string): Promise<DeleteResponse> {
    await this.googleApiService.deleteEvent(client, id);

    const data: DeleteResponse = {
      deleted: true,
    };

    return data;
  }

  async listFloors(client: OAuth2Client, domain: string): Promise<string[]> {
    const floors = await this.authService.getFloors(client, domain);
    return floors;
  }

  async searchPeople(client: OAuth2Client, emailQuery: string): Promise<IAttendeeInformation[]> {
    const response = await this.googleApiService.searchPeople(client, emailQuery);
    const peoples: IAttendeeInformation[] = response.map((people) => {
      const email = people.emailAddresses.find((email) => email.metadata.primary && email.metadata.verified);
      const photo = people.photos.find((photo) => photo.metadata.primary);
      const name = people.names?.find((name) => name.metadata.primary);
      return {
        email: email?.value,
        name: name?.displayName,
        photo: photo?.url,
      };
    });

    return peoples;
  }
}
