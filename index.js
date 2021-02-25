'use strict';

// Import the Dialogflow module from Google client libraries.
const functions = require('firebase-functions');
const {google} = require('googleapis');
const {WebhookClient} = require('dialogflow-fulfillment');

// Enter your calendar ID below and service account JSON below
const calendarId = "CALENDAR_ID"; //You must put your calendar_id
const serviceAccount = {
  //JSON key
};

// Set up Google Calendar Service account credentials
const serviceAccountAuth = new google.auth.JWT({
 email: serviceAccount.client_email,
 key: serviceAccount.private_key,
 scopes: 'https://www.googleapis.com/auth/calendar'
});

const calendar = google.calendar('v3');
process.env.DEBUG = 'dialogflow:*'; // enables lib debugging statements

const timeZone = 'America/Buenos_Aires';
const timeZoneOffset = '-03:00';

// Set the DialogflowApp object to handle the HTTPS POST request.
exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
 const agent = new WebhookClient({ request, response });
 console.log("Parameters", agent.parameters);
 const appointment_type = agent.parameters.nombre;
 const raza = agent.parameters.raza;
 const tel = agent.parameters.tel;
 const dni = agent.parameters.dni;

  function makeAppointment(agent) {
    // Calculate appointment start and end datetimes (end = +1hr from start)
    const dateTimeStart = convertParametersDate(agent.parameters.fecha, agent.parameters.hora);
    const dateTimeEnd = addHours(dateTimeStart, 2);
    const appointmentTimeString = dateTimeStart.toLocaleString(
        'es-ES',
        { month: 'long', day: 'numeric', hour: 'numeric', timeZone: timeZone }
    );
    // Check the availability of the time, and make an appointment if there is time on the calendar
    return createCalendarEvent(dateTimeStart, dateTimeEnd, appointment_type, raza, tel, dni).then(() => {
        agent.add(`Ok, ${appointment_type} tu cita está reservada. ${appointmentTimeString} esta agendado!. Ingrese "hola" para volver al menú.`);
    }).catch(() => {
        agent.add(`Lo siento no tenemos disponible ese horario ${appointmentTimeString}. Ingrese "hola" para volver al menú.`);
    });
  }
  
  function deleteAppointment (agent) {
    // Calculate appointment start and end datetimes (end = +1hr from start)
    // Check the availibility of the time, and make an appointment if there is time on the calendar
    return deleteEvent(dni).then(() => {
      agent.add('Ok, su turno fue eliminado satisfactoriamente. Ingrese "hola" para volver al menú.');
    }).catch(() => {
      agent.add('No se encontró el turno con dicho DNI, ingrese "hola" para volver al menú.');
    });
  }

  function updateAppointment(agent) {
    // Calculate appointment start and end datetimes (end = +1hr from start)
    const dateTimeStart = convertParametersDate(agent.parameters.fecha, agent.parameters.hora);
    const dateTimeEnd = addHours(dateTimeStart, 2);
    const appointmentTimeString = dateTimeStart.toLocaleString(
        'es-ES',
        { month: 'long', day: 'numeric', hour: 'numeric', timeZone: timeZone }
    );
    // Update an User's event
    return updateEvent(dateTimeStart, dateTimeEnd, dni).then(() => {
        agent.add(`Ok, ${appointment_type} tu cita está reservada. ${appointmentTimeString} está agendado!. Ingrese "hola" para volver al menú.`);
      }).catch(() => {
        agent.add('Si el dni fue correctamente ingresado, me temo que ese turno está ocupado. Porfavor ingrese "hola" para volver al menú.');
      });
  }
// Handle the Dialogflow intent named 'Schedule Appointment'.
 let intentMap = new Map();
 intentMap.set('calendario', makeAppointment );
 intentMap.set('Borrar_turno', deleteAppointment );
 intentMap.set('update_turno', updateAppointment );
 agent.handleRequest(intentMap);
});

//Creates calendar event in Google Calendar
function createCalendarEvent (dateTimeStart, dateTimeEnd, appointment_type, raza, tel, dni) {
 return new Promise((resolve, reject) => {
   calendar.events.list({
     auth: serviceAccountAuth, // List events for time period
     calendarId: calendarId,
     timeMin: dateTimeStart.toISOString(),
     timeMax: dateTimeEnd.toISOString()
   }, (err, calendarResponse) => {
     //functions.logger.log('calendar---->', calendarResponse);
     // Check if there is a event already on the Calendar
     if (err || calendarResponse.data.items.length > 0) {
       reject(err || new Error('Requested time conflicts with another appointment'));
     } else {
       // Create event for the requested time period
       calendar.events.insert({ auth: serviceAccountAuth,
         calendarId: calendarId,
         resource: {summary: appointment_type +' ', description: raza + '<br>' + tel+ '<br>' + dni,
           start: {dateTime: dateTimeStart},
           end: {dateTime: dateTimeEnd}}
       }, (err, event) => {
         err ? reject(err) : resolve(event);
       }
       );
     }
   });
 });
}

const deleteEvent = (dni) => {
  return new Promise((resolve, reject) => {
    //LIST the events
      console.log('iniciaDeleteEventWithId');
      calendar.events.list({
          auth: serviceAccountAuth, // List events for time period
          calendarId: calendarId,
          q: dni
        }, (err, res) => {
          // Check if there is a event already on the Calendar
          if (err) {
            reject(err);
          } else {
            // Delete event with DNI
            console.log('Respuesta lista :' + res);
            res.data.items.forEach(event => {
              calendar.events.delete({
              auth: serviceAccountAuth,
              calendarId: calendarId,
              eventId: event.id
            }, (err, event) => {
              err ? reject(err) : resolve(event);
              });
            });
          }
      });
  });
};

const updateEvent = (dateTimeStart, dateTimeEnd, dni) => {
  return new Promise((resolve, reject) => {
    //LIST the events
      console.log('iniciaUpdate');
      calendar.events.list({
          auth: serviceAccountAuth, // List events for time period
          calendarId: calendarId,
          q: dni
        }, (err, res) => {
          // Check if there is a event already on the Calendar
          if (err || res.data.items.length > 0) {
            reject(err || new Error('Requested time conflicts with another appointment'));
          } else {
            // Delete event with DNI
            console.log('Respuesta lista :' + res);
            res.data.items.forEach(event => {
             calendar.events.patch({
              auth: serviceAccountAuth,
              calendarId: calendarId,
              eventId: event.id,
              resource: {
                 end: {
                   dateTime: dateTimeEnd
                 },
                 start: {
                   dateTime: dateTimeStart
                 }
               }
            }, (err, event) => {
              err ? reject(err) : resolve(event);
              });
            });
          }
      });
  });
};

function convertParametersDate(date, time) {
    return new Date(Date.parse(date.split('T')[0] + 'T' + time.split('T')[1].split('-')[0] + timeZoneOffset));
}

// A helper function that adds the integer value of 'hoursToAdd' to the Date instance 'dateObj' and returns a new Data instance.
function addHours(dateObj, hoursToAdd) {
    return new Date(new Date(dateObj).setHours(dateObj.getHours() + hoursToAdd));
}