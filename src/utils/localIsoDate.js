export const localIsoDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().split("T")[0];
