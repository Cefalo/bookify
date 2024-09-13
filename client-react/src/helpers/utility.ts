export function populateTimeOptions() {
  const timeOptions = [];
  let currentTime: number | null = null;

  const now = new Date();
  let currentHours = now.getHours();
  let currentMinutes = Math.floor(now.getMinutes() / 15) * 15;

  if (currentMinutes === 60) {
    currentMinutes = 0;
    currentHours += 1;
  }

  const currentTimeInMinutes = toMinutesSinceMidnight(currentHours, currentMinutes);

  for (let i = 0; i < 24 * 4; i++) {
    const hours = Math.floor(i / 4);
    const minutes = (i % 4) * 15;
    const formattedTime = formatTime(hours, minutes);
    const optionTimeInMinutes = toMinutesSinceMidnight(hours, minutes);

    if (optionTimeInMinutes >= currentTimeInMinutes) {
      timeOptions.push(formattedTime);

      if (optionTimeInMinutes === currentTimeInMinutes) {
        currentTime = currentTimeInMinutes;
      }
    }
  }

  return timeOptions;
}

export function toMinutesSinceMidnight(hours: number, minutes: number) {
  return hours * 60 + minutes;
}

export function formatTime(hours: number, minutes: number) {
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // If hour is 0, it should be 12
  const _minutes = minutes < 10 ? '0' + minutes : minutes;
  return hours + ':' + _minutes + ' ' + ampm;
}

// returns timeZone formatted as "Asia/Dhaka", etc
export function getTimeZoneString() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return timeZone;
}

export function getTimezoneOffset() {
  const offsetInMinutes = new Date().getTimezoneOffset();
  const sign = offsetInMinutes <= 0 ? '+' : '-';
  const offsetInHours = Math.floor(Math.abs(offsetInMinutes) / 60);
  const offsetInRemainingMinutes = Math.abs(offsetInMinutes) % 60;
  const formattedOffset = `${sign}${String(offsetInHours).padStart(2, '0')}:${String(offsetInRemainingMinutes).padStart(2, '0')}`;

  return formattedOffset;
}

export function convertToRFC3339(dateString: string, timeString: string) {
  const timeZoneOffset = getTimezoneOffset();
  const date = new Date(`${dateString} ${timeString}`);

  const [offsetSign, offsetHours, offsetMinutes] = timeZoneOffset.match(/([+-])(\d{2}):(\d{2})/)!.slice(1);

  const offsetInMinutes = (parseInt(offsetHours) * 60 + parseInt(offsetMinutes)) * (offsetSign === '+' ? 1 : -1);
  date.setMinutes(date.getMinutes() + offsetInMinutes);

  const isoString = date.toISOString();
  const [isoDate, isoTime] = isoString.split('T');

  // Return the formatted date and time in RFC 3339 format
  return `${isoDate}T${isoTime.split('.')[0]}${timeZoneOffset}`;
}

export function convertToLocaleTime(dateStr?: string) {
  if (!dateStr) return '-';

  const date = new Date(dateStr);

  const options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  };

  return date.toLocaleTimeString('en-US', options);
}