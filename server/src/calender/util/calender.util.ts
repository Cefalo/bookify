import { ConferenceRoom } from '../../auth/entities';
import { BusyTimes } from '../interfaces/freebusy.interface';

export function isRoomAvailable(busyTimes: BusyTimes[], startTime: Date, endTime: Date) {
  for (const timeSlot of busyTimes) {
    const busyStart = new Date(timeSlot.start);
    const busyEnd = new Date(timeSlot.end);

    if (startTime < busyEnd && endTime > busyStart) {
      return false;
    }
  }

  return true;
}

export function extractRoomName(rooms: ConferenceRoom[], googleApiRoomName: string) {
  const index = rooms.findIndex((room) => googleApiRoomName.toLowerCase().includes(room.name.toLowerCase()));
  if (index !== -1) {
    return rooms[index].name;
  }

  return null;
}

export const validateEmail = (email: string) => {
  return String(email)
    .toLowerCase()
    .match(
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
    );
};

export function toMins(ms: number) {
  return ms / (1000 * 60);
}

export function toMs(min: number) {
  return min * 60 * 1000;
}
