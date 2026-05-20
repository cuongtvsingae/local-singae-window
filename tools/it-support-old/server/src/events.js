const { EventEmitter } = require('events');

// Shared in-process event bus for IT Support (SSE clients subscribe to this).
const itSupportEvents = new EventEmitter();
itSupportEvents.setMaxListeners(200);

function emitTaskCreated(payload) {
  try {
    itSupportEvents.emit('task_created', {
      id: `task_created_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'task_created',
      timestamp: new Date().toISOString(),
      ...payload
    });
  } catch (_) {}
}

function emitAssistantEvent(payload) {
  try {
    itSupportEvents.emit('assistant_event', {
      id: `assistant_event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'assistant_event',
      timestamp: new Date().toISOString(),
      ...payload
    });
  } catch (_) {}
}

module.exports = {
  itSupportEvents,
  emitTaskCreated,
  emitAssistantEvent
};

