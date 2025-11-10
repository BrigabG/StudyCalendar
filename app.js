// ===== FIREBASE CONFIGURATION =====

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA6sSEGd56paaEaE2PAUTY9wTFG_DlFdCQ",
  authDomain: "studycalendar-4a5e9.firebaseapp.com",
  projectId: "studycalendar-4a5e9",
  storageBucket: "studycalendar-4a5e9.firebasestorage.app",
  messagingSenderId: "555933762697",
  appId: "1:555933762697:web:545619809a3e41ff293258"
};

// Inicializar Firebase
let database;
try {
    firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    console.log("✅ Firebase conectado correctamente");
} catch (error) {
    console.error("❌ Error al conectar con Firebase:", error);
    alert("Error de conexión con Firebase. Por favor verifica tu configuración.");
}

// ===== GLOBAL STATE =====
let calendar;
let currentUser = 'user1';
let subjects = {};
let events = {};
let userStats = {
    user1: { currentStreak: 0, bestStreak: 0, totalDays: 0, lastStudyDate: null },
    user2: { currentStreak: 0, bestStreak: 0, totalDays: 0, lastStudyDate: null }
};

let editingSubjectId = null;
let editingEventId = null;

// ===== FIREBASE LISTENERS =====
function setupFirebaseListeners() {
    // Escuchar cambios en asignaturas
    database.ref('subjects').on('value', (snapshot) => {
        subjects = snapshot.val() || {};
        updateSubjectsList();
        // updateSubjectFilters(); // Ya no se necesitan filtros
        updateSubjectSelectors();
        if (calendar) calendar.refetchEvents();
    });

    // Escuchar cambios en eventos
    database.ref('events').on('value', (snapshot) => {
        events = snapshot.val() || {};
        if (calendar) calendar.refetchEvents();
        updateStats();
    });

    // Escuchar cambios en estadísticas
    database.ref('userStats').on('value', (snapshot) => {
        userStats = snapshot.val() || userStats;
        updateStats();
    });
}

// ===== INITIALIZE APP =====
document.addEventListener('DOMContentLoaded', () => {
    setupFirebaseListeners();
    initializeCalendar();
    setupEventListeners();
    updateStats();
});

// ===== FULLCALENDAR INITIALIZATION =====
function initializeCalendar() {
    const calendarEl = document.getElementById('calendar');
    
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'es',
        headerToolbar: false,
        height: 'auto',
        editable: true, // Habilitar arrastrar y soltar
        droppable: true,
        events: function(info, successCallback) {
            const calendarEvents = [];
            
            for (let eventId in events) {
                const event = events[eventId];

                // Manejar día libre (sin asignatura)
                if (event.type === 'free') {
                    calendarEvents.push({
                        id: eventId,
                        title: '🌙 Día Libre',
                        start: event.date,
                        backgroundColor: '#6c757d',
                        borderColor: '#495057',
                        extendedProps: {
                            type: event.type,
                            subjectId: null,
                            completed: false,
                            notes: event.notes || ''
                        },
                        classNames: ['free-day-event']
                    });
                    continue;
                }

                const subject = subjects[event.subjectId];

                if (!subject) continue;

                const eventColor = event.type === 'exam'
                    ? subject.color
                    : lightenColor(subject.color, 40);

                let eventTitle = event.type === 'exam'
                    ? `📝 ${subject.name.toUpperCase()}`  // MAYÚSCULAS para exámenes
                    : `📚 ${subject.name}`;

                if (event.completed) {
                    eventTitle += ' ✓';
                }

                calendarEvents.push({
                    id: eventId,
                    title: eventTitle,
                    start: event.date,
                    backgroundColor: eventColor,
                    borderColor: eventColor,
                    extendedProps: {
                        type: event.type,
                        subjectId: event.subjectId,
                        completed: event.completed || false,
                        notes: event.notes || ''
                    },
                    classNames: [
                        event.type === 'exam' ? 'exam-event' : 'study-event',
                        event.completed ? 'completed-event' : ''
                    ]
                });
            }
            
            successCallback(calendarEvents);
        },
        eventClick: function(info) {
            openEventModal(info.event);
        },
        dateClick: function(info) {
            openEventModal(null, info.dateStr);
        },
        eventDrop: function(info) {
            // Actualizar la fecha del evento en Firebase cuando se arrastra
            const newDate = info.event.startStr;
            const eventId = info.event.id;

            database.ref(`events/${eventId}`).update({
                date: newDate
            }).then(() => {
                console.log(`✅ Evento movido a ${newDate}`);
            }).catch((error) => {
                console.error('❌ Error al mover evento:', error);
                // Revertir el cambio si hay error
                info.revert();
                alert('Error al mover el evento. Inténtalo de nuevo.');
            });
        },
        drop: function(info) {
            // Manejar cuando se arrastra un item externo al calendario
            const eventType = info.draggedEl.getAttribute('data-event-type');
            const date = info.dateStr;

            // Para días libres, no necesitamos seleccionar asignatura
            if (eventType === 'free') {
                database.ref('events').push({
                    type: 'free',
                    date: date,
                    notes: 'Día libre',
                    completed: false,
                    subjectId: null
                }).then(() => {
                    console.log(`✅ Día libre agregado: ${date}`);
                }).catch((error) => {
                    console.error('❌ Error al agregar día libre:', error);
                    alert('Error al agregar día libre. Inténtalo de nuevo.');
                });
                return;
            }

            // Para días de estudio y exámenes, abrir el modal de selección
            openEventModal(null, date, eventType);
        }
    });
    
    calendar.render();

    // Hacer los items externos arrastrables
    setupDraggableItems();
}

// ===== SETUP DRAGGABLE ITEMS =====
function setupDraggableItems() {
    const draggableItems = document.querySelectorAll('.draggable-item');

    draggableItems.forEach(item => {
        new FullCalendar.Draggable(item, {
            itemSelector: '.draggable-item',
            eventData: function(eventEl) {
                return {
                    title: eventEl.innerText,
                    create: true
                };
            }
        });
    });
}

// ===== NAVIGATION =====
function setupEventListeners() {
    // Navigation buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            const viewName = e.target.dataset.view;
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.getElementById(`${viewName}-view`).classList.add('active');
            
            if (viewName === 'calendar' && calendar) {
                setTimeout(() => calendar.updateSize(), 100);
            }
        });
    });
    
    // User selector
    document.getElementById('currentUser').addEventListener('change', (e) => {
        currentUser = e.target.value;
        updateStats();
    });
    
    // Calendar controls
    document.getElementById('prevPeriod').addEventListener('click', () => {
        calendar.prev();
    });
    
    document.getElementById('today').addEventListener('click', () => {
        calendar.today();
    });
    
    document.getElementById('nextPeriod').addEventListener('click', () => {
        calendar.next();
    });
    
    document.getElementById('calendarType').addEventListener('change', (e) => {
        calendar.changeView(e.target.value);
    });
    
    // Add buttons
    document.getElementById('addSubject').addEventListener('click', () => openSubjectModal());
    document.getElementById('addStudyDay').addEventListener('click', () => openEventModal(null, null, 'study'));
    document.getElementById('addExam').addEventListener('click', () => openEventModal(null, null, 'exam'));
    document.getElementById('autoAssign').addEventListener('click', () => openAutoAssignModal());
    
    // Modal close buttons
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', () => {
            closeBtn.closest('.modal').classList.remove('active');
        });
    });
    
    // Click outside modal to close
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
    
    // Forms
    document.getElementById('subjectForm').addEventListener('submit', handleSubjectSubmit);
    document.getElementById('cancelSubject').addEventListener('click', () => {
        document.getElementById('subjectModal').classList.remove('active');
    });
    
    document.getElementById('eventForm').addEventListener('submit', handleEventSubmit);
    document.getElementById('cancelEvent').addEventListener('click', () => {
        document.getElementById('eventModal').classList.remove('active');
    });
    document.getElementById('deleteEvent').addEventListener('click', handleEventDelete);

    // Ocultar selector de asignatura cuando el tipo es "Día Libre"
    document.getElementById('eventType').addEventListener('change', (e) => {
        const subjectGroup = document.getElementById('eventSubject').closest('.form-group');
        if (e.target.value === 'free') {
            subjectGroup.style.display = 'none';
        } else {
            subjectGroup.style.display = 'block';
        }
    });
    
    document.getElementById('autoAssignForm').addEventListener('submit', handleAutoAssign);
    document.getElementById('cancelAutoAssign').addEventListener('click', () => {
        document.getElementById('autoAssignModal').classList.remove('active');
    });
}

// ===== SUBJECT MODAL =====
function openSubjectModal(subjectId = null) {
    editingSubjectId = subjectId;
    const modal = document.getElementById('subjectModal');
    const form = document.getElementById('subjectForm');
    
    form.reset();
    
    if (subjectId && subjects[subjectId]) {
        const subject = subjects[subjectId];
        document.getElementById('subjectModalTitle').textContent = 'Editar Asignatura';
        document.getElementById('subjectName').value = subject.name;
        document.getElementById('subjectColor').value = subject.color;
        document.getElementById('subjectPriority').value = subject.priority;
        document.getElementById('subjectExamDate').value = subject.examDate || '';
        document.getElementById('subjectDocs').value = subject.docs ? subject.docs.join(', ') : '';
    } else {
        document.getElementById('subjectModalTitle').textContent = 'Nueva Asignatura';
    }
    
    modal.classList.add('active');
}

function handleSubjectSubmit(e) {
    e.preventDefault();
    
    const name = document.getElementById('subjectName').value.trim();
    const color = document.getElementById('subjectColor').value;
    const priority = parseInt(document.getElementById('subjectPriority').value);
    const examDate = document.getElementById('subjectExamDate').value;
    const docsText = document.getElementById('subjectDocs').value.trim();
    const docs = docsText ? docsText.split(',').map(d => d.trim()).filter(d => d) : [];
    
    const subjectData = { name, color, priority, examDate, docs };
    
    if (editingSubjectId) {
        database.ref(`subjects/${editingSubjectId}`).update(subjectData);
    } else {
        database.ref('subjects').push(subjectData);
    }
    
    document.getElementById('subjectModal').classList.remove('active');
    editingSubjectId = null;
}

function deleteSubject(subjectId) {
    if (!confirm('¿Estás seguro de eliminar esta asignatura? Se eliminarán todos sus eventos asociados.')) {
        return;
    }
    
    // Eliminar eventos asociados
    for (let eventId in events) {
        if (events[eventId].subjectId === subjectId) {
            database.ref(`events/${eventId}`).remove();
        }
    }
    
    // Eliminar asignatura
    database.ref(`subjects/${subjectId}`).remove();
}

// ===== EVENT MODAL =====
function openEventModal(calendarEvent = null, dateStr = null, eventType = 'study') {
    editingEventId = calendarEvent ? calendarEvent.id : null;
    const modal = document.getElementById('eventModal');
    const form = document.getElementById('eventForm');
    
    form.reset();
    document.getElementById('deleteEvent').style.display = calendarEvent ? 'block' : 'none';
    document.getElementById('completedGroup').style.display = calendarEvent ? 'block' : 'none';

    let selectedEventType = eventType;

    if (calendarEvent) {
        document.getElementById('eventModalTitle').textContent = 'Editar Evento';
        const event = events[calendarEvent.id];
        document.getElementById('eventSubject').value = event.subjectId || '';
        document.getElementById('eventType').value = event.type;
        document.getElementById('eventDate').value = event.date;
        document.getElementById('eventNotes').value = event.notes || '';
        document.getElementById('eventCompleted').checked = event.completed || false;
        selectedEventType = event.type;
    } else {
        document.getElementById('eventModalTitle').textContent = 'Agregar Evento';
        if (dateStr) {
            document.getElementById('eventDate').value = dateStr;
        }
        document.getElementById('eventType').value = eventType;
    }

    // Ocultar/mostrar selector de asignatura según el tipo
    const subjectGroup = document.getElementById('eventSubject').closest('.form-group');
    if (selectedEventType === 'free') {
        subjectGroup.style.display = 'none';
    } else {
        subjectGroup.style.display = 'block';
    }

    modal.classList.add('active');
}

function handleEventSubmit(e) {
    e.preventDefault();

    const subjectId = document.getElementById('eventSubject').value;
    const type = document.getElementById('eventType').value;
    const date = document.getElementById('eventDate').value;
    const notes = document.getElementById('eventNotes').value.trim();
    const completed = document.getElementById('eventCompleted').checked;

    // Para días libres, no se requiere asignatura
    if (type !== 'free' && !subjectId) {
        alert('Por favor selecciona una asignatura');
        return;
    }

    const eventData = {
        subjectId: type === 'free' ? null : subjectId,
        type,
        date,
        notes,
        completed
    };

    if (editingEventId) {
        database.ref(`events/${editingEventId}`).update(eventData);
    } else {
        database.ref('events').push(eventData);
    }

    // Actualizar estadísticas si se completó un día de estudio
    if (completed && type === 'study') {
        updateUserStats(date);
    }

    document.getElementById('eventModal').classList.remove('active');
    editingEventId = null;
}

function handleEventDelete() {
    if (!confirm('¿Estás seguro de eliminar este evento?')) {
        return;
    }
    
    database.ref(`events/${editingEventId}`).remove();
    document.getElementById('eventModal').classList.remove('active');
    editingEventId = null;
}

// ===== AUTO-ASSIGN MODAL =====
function openAutoAssignModal() {
    const modal = document.getElementById('autoAssignModal');
    document.getElementById('autoAssignForm').reset();
    modal.classList.add('active');
}

function handleAutoAssign(e) {
    e.preventDefault();
    
    const subjectId = document.getElementById('autoSubject').value;
    const startDate = new Date(document.getElementById('autoStartDate').value);
    const endDate = new Date(document.getElementById('autoEndDate').value);
    
    if (!subjectId) {
        alert('Por favor selecciona una asignatura');
        return;
    }
    
    if (startDate >= endDate) {
        alert('La fecha de inicio debe ser anterior a la fecha de fin');
        return;
    }
    
    // Obtener días excluidos
    const excludedDays = Array.from(document.querySelectorAll('.days-selector input[type="checkbox"]:checked'))
        .map(cb => parseInt(cb.value));
    
    const subject = subjects[subjectId];
    const priority = subject.priority;
    
    // Calcular días de estudio según prioridad
    const totalDays = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
    let studyDaysCount = Math.floor(totalDays * (priority / 4) * 0.6); // 60% como máximo
    studyDaysCount = Math.max(3, studyDaysCount); // Mínimo 3 días
    
    // Generar días de estudio
    const studyDays = [];
    const currentDate = new Date(startDate);
    let daysAdded = 0;
    
    while (currentDate <= endDate && daysAdded < studyDaysCount) {
        const dayOfWeek = currentDate.getDay();
        
        if (!excludedDays.includes(dayOfWeek)) {
            studyDays.push(new Date(currentDate));
            daysAdded++;
        }
        
        // Saltar días según prioridad (mayor prioridad = más frecuente)
        const skipDays = priority === 4 ? 1 : priority === 3 ? 2 : priority === 2 ? 3 : 4;
        currentDate.setDate(currentDate.getDate() + skipDays);
    }
    
    // Agregar días de estudio a Firebase
    studyDays.forEach(date => {
        const dateStr = date.toISOString().split('T')[0];
        database.ref('events').push({
            subjectId,
            type: 'study',
            date: dateStr,
            notes: 'Generado automáticamente',
            completed: false
        });
    });
    
    // Agregar examen al final
    const examDateStr = endDate.toISOString().split('T')[0];
    database.ref('events').push({
        subjectId,
        type: 'exam',
        date: examDateStr,
        notes: 'Examen',
        completed: false
    });
    
    alert(`✅ Se asignaron ${studyDays.length} días de estudio + 1 examen`);
    document.getElementById('autoAssignModal').classList.remove('active');
}

// ===== UPDATE UI =====
function updateSubjectsList() {
    const container = document.getElementById('subjectsList');
    
    if (Object.keys(subjects).length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>📚 No hay asignaturas</h3>
                <p>Crea tu primera asignatura para comenzar</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    
    for (let subjectId in subjects) {
        const subject = subjects[subjectId];
        const card = document.createElement('div');
        card.className = 'subject-card';
        card.style.borderLeftColor = subject.color;
        
        const priorityText = ['Baja', 'Media', 'Alta', 'Muy Alta'][subject.priority - 1];
        const docsHTML = subject.docs && subject.docs.length > 0
            ? `<div class="docs-list">
                ${subject.docs.map(doc => `<a href="${doc}" target="_blank" class="doc-link">📎 Ver documento</a>`).join('')}
               </div>`
            : '<p style="opacity: 0.6;">Sin documentación</p>';
        
        card.innerHTML = `
            <div class="subject-card-header">
                <div>
                    <h3>${subject.name}</h3>
                    <span class="priority-badge priority-${subject.priority}">Prioridad: ${priorityText}</span>
                </div>
                <div class="subject-card-actions">
                    <button class="icon-btn" onclick="openSubjectModal('${subjectId}')" title="Editar">✏️</button>
                    <button class="icon-btn" onclick="deleteSubject('${subjectId}')" title="Eliminar">🗑️</button>
                </div>
            </div>
            <div class="subject-info">
                <div class="subject-info-item">
                    <span class="subject-info-label">Color:</span>
                    <span style="background: ${subject.color}; width: 30px; height: 30px; border-radius: 5px; display: inline-block;"></span>
                </div>
                ${subject.examDate ? `
                <div class="subject-info-item">
                    <span class="subject-info-label">Examen:</span>
                    <span>${new Date(subject.examDate).toLocaleDateString('es-ES')}</span>
                </div>
                ` : ''}
                <div class="subject-info-item" style="flex-direction: column; align-items: flex-start;">
                    <span class="subject-info-label">Documentación:</span>
                    ${docsHTML}
                </div>
            </div>
        `;
        
        container.appendChild(card);
    }
}

function updateSubjectFilters() {
    const container = document.getElementById('subjectFilters');
    container.innerHTML = '';
    
    for (let subjectId in subjects) {
        const subject = subjects[subjectId];
        const chip = document.createElement('div');
        chip.className = 'filter-chip active';
        chip.style.borderColor = subject.color;
        chip.style.backgroundColor = subject.color;
        chip.textContent = subject.name;
        chip.dataset.subjectId = subjectId;
        
        chip.addEventListener('click', () => {
            chip.classList.toggle('active');
            if (chip.classList.contains('active')) {
                chip.style.backgroundColor = subject.color;
                chip.style.color = '#ffffff';
            } else {
                chip.style.backgroundColor = '#ffffff';
                chip.style.color = subject.color;
            }
            calendar.refetchEvents();
        });
        
        container.appendChild(chip);
    }
}

function updateSubjectSelectors() {
    const selectors = [
        document.getElementById('eventSubject'),
        document.getElementById('autoSubject')
    ];
    
    selectors.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Selecciona una asignatura</option>';
        
        for (let subjectId in subjects) {
            const subject = subjects[subjectId];
            const option = document.createElement('option');
            option.value = subjectId;
            option.textContent = subject.name;
            select.appendChild(option);
        }
        
        if (currentValue) select.value = currentValue;
    });
}

function updateStats() {
    const stats = userStats[currentUser];
    
    document.getElementById('currentStreak').textContent = `${stats.currentStreak} días`;
    document.getElementById('bestStreak').textContent = `${stats.bestStreak} días`;
    document.getElementById('totalDays').textContent = `${stats.totalDays} días`;
    
    // Contar próximos exámenes
    const today = new Date().toISOString().split('T')[0];
    const upcomingExams = Object.values(events).filter(e => 
        e.type === 'exam' && e.date >= today
    ).length;
    document.getElementById('upcomingExams').textContent = upcomingExams;
    
    // Distribución por asignatura
    updateSubjectsDistribution();
}

function updateSubjectsDistribution() {
    const container = document.getElementById('subjectsDistribution');
    
    if (Object.keys(subjects).length === 0) {
        container.innerHTML = '<p style="opacity: 0.6;">No hay asignaturas para mostrar</p>';
        return;
    }
    
    // Contar días de estudio por asignatura
    const studyCount = {};
    for (let subjectId in subjects) {
        studyCount[subjectId] = 0;
    }
    
    for (let eventId in events) {
        const event = events[eventId];
        if (event.type === 'study' && event.completed) {
            studyCount[event.subjectId] = (studyCount[event.subjectId] || 0) + 1;
        }
    }
    
    const maxCount = Math.max(...Object.values(studyCount), 1);
    
    container.innerHTML = '';
    
    for (let subjectId in subjects) {
        const subject = subjects[subjectId];
        const count = studyCount[subjectId] || 0;
        const percentage = (count / maxCount) * 100;
        
        const barDiv = document.createElement('div');
        barDiv.className = 'subject-stat-bar';
        barDiv.innerHTML = `
            <div class="subject-stat-name">${subject.name}</div>
            <div class="subject-stat-progress">
                <div class="subject-stat-fill" style="width: ${percentage}%; background: ${subject.color};">
                    ${count} días
                </div>
            </div>
        `;
        
        container.appendChild(barDiv);
    }
}

function updateUserStats(completedDate) {
    const stats = userStats[currentUser];
    stats.totalDays++;
    
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    if (completedDate === today || completedDate === yesterdayStr) {
        if (stats.lastStudyDate === yesterdayStr || stats.lastStudyDate === today) {
            stats.currentStreak++;
        } else {
            stats.currentStreak = 1;
        }
        
        if (stats.currentStreak > stats.bestStreak) {
            stats.bestStreak = stats.currentStreak;
        }
        
        stats.lastStudyDate = completedDate;
    }
    
    database.ref(`userStats/${currentUser}`).set(stats);
}

// ===== UTILITY FUNCTIONS =====
function lightenColor(color, percent) {
    const num = parseInt(color.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
        (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
        (B < 255 ? B < 1 ? 0 : B : 255))
        .toString(16).slice(1);
}

// Hacer funciones globales para los onclick del HTML
window.openSubjectModal = openSubjectModal;
window.deleteSubject = deleteSubject;
