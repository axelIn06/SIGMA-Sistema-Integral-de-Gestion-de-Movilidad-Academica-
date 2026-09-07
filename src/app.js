import { createClient } from '@supabase/supabase-js';
import { tsParticles } from '@tsparticles/engine';
import { loadSlim } from '@tsparticles/slim';
import unsaacShieldUrl from './assets/unsaac-escudo.png';
import loginBackgroundUrl from './assets/fondo-inicio-sesion.jpg';
import unsaacCampusUrl from './assets/unsaac-ciudad-universitaria.webp';
import sigmaAirplaneUrl from './assets/sigma-airplane.svg';

// Recursos institucionales locales: Vite transforma estas rutas al generar la aplicación.
document.documentElement.style.setProperty('--sigma-shield-image', `url("${unsaacShieldUrl}")`);
document.documentElement.style.setProperty('--sigma-login-image', `url("${loginBackgroundUrl}")`);
document.documentElement.style.setProperty('--sigma-panels-image', `url("${unsaacCampusUrl}")`);

// Adelanta la descarga de los recursos animados mientras se restaura la sesión.
[loginBackgroundUrl, sigmaAirplaneUrl].forEach((url) => {
  const image = new Image();
  image.fetchPriority = 'high';
  image.src = url;
});

// Cliente público: Supabase RLS limita cada operación según la sesión activa.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Estado local mínimo. Las convocatorias publicadas se leen de Supabase;
// no se incluyen registros ficticios para evitar mezclarlos con datos reales.
const INITIAL = {
  calls: [],
  applications: [],
  nominations: [],
};
const LOCAL_STATE_KEY = 'sigma-data';
const LOCAL_STATE_VERSION_KEY = 'sigma-data-version';
const LOCAL_STATE_VERSION = '2';
// Los cuatro roles operativos aprobados para SIGMA.
const ROLE_LABELS = {
  ADMIN_OCRI: 'Administrador OCRI',
  ESTUDIANTE_UNSAAC: 'Alumno UNSAAC',
  GESTOR_EXTERNO: 'Gestor externo',
  ESTUDIANTE_EXTERNO: 'Estudiante externo',
};
const ROLE_VIEWS = {
  ADMIN_OCRI: 'admin',
  ESTUDIANTE_UNSAAC: 'student',
  GESTOR_EXTERNO: 'external_manager',
  ESTUDIANTE_EXTERNO: 'external',
};
const STATUS_LABELS = {
  ENVIADA: 'Postulado',
  OBSERVADA: 'Subsanación pendiente',
  APROBADA_OCRI: 'Aprobado por OCRI',
  FINALIZADA: 'Concluido',
  BORRADOR: 'Borrador',
  POSTULADO: 'Postulado',
  EN_REVISION_DOCUMENTAL: 'En revisión OCRI',
  EN_REVISION_OCRI: 'En revisión OCRI',
  OBSERVADO: 'Subsanación pendiente',
  APROBADO_OCRI: 'Aprobado por OCRI',
  NOMINADO: 'Nominado',
  NOMINADO_UNSAAC: 'Nominado por UNSAAC',
  EN_EVALUACION_DESTINO: 'En evaluación por destino',
  VALIDADO_ORIGEN: 'Validado por universidad de origen',
  ACEPTADO: 'Aceptado',
  NO_ADMITIDO_UNSAAC: 'No admitido por UNSAAC',
  NO_ADMITIDO: 'No admitido',
  NO_ACEPTADO_DESTINO: 'No aceptado por universidad destino',
  EN_MOVILIDAD: 'En movilidad',
  CONCLUIDO: 'Concluido',
  FINALIZADO: 'Concluido',
  CANCELADO: 'Cancelado',
  INVITACION_ENVIADA: 'Invitación enviada',
};
let state = load();
let session = null;
let route = 'dashboard';
let passwordRecoveryMode = false;
let accessProfiles = [];
let callDraft = null;
let callWizardStep = 1;
let editingCallId = null;
let pendingProfilePhotoPreview = '';
let applicationDraft = null;
let selectedStudentApplicationId = null;
let academicCatalog = [];
const pendingApplicationFiles = new Map();
let loginAnimation = null;
const particleLibraryReady = loadSlim(tsParticles);

// Permite usar plantillas HTML formateadas sin alterar sus interpolaciones.
const html = (strings, ...values) => String.raw({ raw: strings }, ...values);

// -----------------------------------------------------------------------------
// Estado local y utilidades de presentación
// -----------------------------------------------------------------------------
function load() {
  try {
    // La versión 2 inicia sin el catálogo de prueba que usaba el prototipo.
    // Este único cambio invalida de forma controlada el estado almacenado antes
    // de la limpieza; las sesiones de Supabase no se eliminan aquí.
    if (localStorage.getItem(LOCAL_STATE_VERSION_KEY) !== LOCAL_STATE_VERSION) {
      localStorage.setItem(LOCAL_STATE_VERSION_KEY, LOCAL_STATE_VERSION);
      localStorage.removeItem(LOCAL_STATE_KEY);
      return structuredClone(INITIAL);
    }

    const stored = JSON.parse(localStorage.getItem(LOCAL_STATE_KEY)) || {};
    return {
      ...structuredClone(INITIAL),
      // Solo las nominaciones continúan como prototipo local. Convocatorias y
      // postulaciones siempre se reconstruyen desde Supabase al iniciar sesión.
      nominations: Array.isArray(stored.nominations) ? stored.nominations : [],
    };
  } catch {
    return structuredClone(INITIAL);
  }
}
function save() {
  localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify({ nominations: state.nominations }));
}
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>'"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c],
  );
const shortDate = (value) => {
  const [year, month, day] = String(value || '').split('-');
  return year && month && day ? `${day}/${month}/${year.slice(-2)}` : 'Por definir';
};

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');

// Convierte la forma relacional de PostgreSQL en la forma que consumen las vistas.
async function mapDatabaseCall(call) {
  const [cover, resources] = await Promise.all([
    call.cover_image_path
      ? supabase.storage.from('call-assets').createSignedUrl(call.cover_image_path, 60 * 60)
      : null,
    Promise.all(
      (call.call_resources || []).map(async (resource) => {
        const signed = resource.storage_path
          ? await supabase.storage
              .from('call-assets')
              .createSignedUrl(resource.storage_path, 60 * 60)
          : null;
        return {
          description: resource.description || '',
          fileName: resource.file_name || 'Material OCRI',
          storagePath: resource.storage_path || '',
          downloadUrl: signed?.data?.signedUrl || '',
        };
      }),
    ),
  ]);
  return {
    id: call.id,
    code: call.code,
    title: call.title,
    direction: call.direction,
    period: call.period,
    end: call.closes_on,
    status: call.status,
    coverImagePath: call.cover_image_path || '',
    coverImage: cover?.data?.signedUrl || '',
    coverName: call.cover_image_path?.split('/').at(-1) || '',
    guidelines: (call.call_guidelines || []).map((item) => item.content),
    documents: (call.call_requirements || []).map((item) => ({
      requirementId: item.id,
      title: item.title,
      description: item.description || '',
      required: item.is_required,
    })),
    resources,
    notice: {
      links: (call.call_notices?.[0]?.call_notice_links || []).map((item) => ({
        label: item.label,
        url: item.url || '',
      })),
    },
  };
}

async function loadCallsFromDatabase() {
  if (!supabase || !session) return;
  const { data, error } = await supabase
    .from('calls')
    .select(
      'id,code,title,direction,period,closes_on,status,cover_image_path,call_guidelines(content,display_order),call_requirements(id,title,description,is_required,display_order),call_resources(description,file_name,storage_path,display_order),call_notices(call_notice_links(label,url,display_order))',
    )
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('No se pudieron cargar las convocatorias desde Supabase.', error.message);
    state.calls = [];
    return;
  }

  state.calls = await Promise.all(data.map(mapDatabaseCall));
}

async function loadApplicationsFromDatabase() {
  if (!supabase || !session) return;
  const { data, error } = await supabase
    .from('applications')
    .select(
      'id,call_id,applicant_id,status,student_code,faculty,academic_program,submitted_at,created_at,calls(title,direction,period),profiles!applications_applicant_id_fkey(full_name,email),application_documents(id,requirement_id,requirement_title,is_required,storage_path,file_name,status,reviewer_comment)',
    )
    .order('updated_at', { ascending: false });

  if (error) {
    console.warn('No se pudieron cargar las postulaciones desde Supabase.', error.message);
    state.applications = [];
    return;
  }

  const { data: letters } = await supabase.from('acceptance_letters').select('*');
  state.applications = data.map((application) => {
    const documents = application.application_documents || [];
    const completedDocuments = documents.filter((document) => document.storage_path).length;
    const completedFields = [application.faculty, application.academic_program].filter(
      Boolean,
    ).length;
    const totalParts = 2 + documents.length;
    const progress = Math.round(
      ((completedFields + completedDocuments) / Math.max(totalParts, 1)) * 100,
    );
    const date = application.submitted_at || application.created_at;

    return {
      id: application.id,
      letter: letters?.find((l) => l.application_id === application.id) || null,
      displayId: `${application.calls?.direction === 'ENTRANTE' ? 'SGME' : 'SGMS'}-${application.id.slice(0, 6).toUpperCase()}`,
      callId: application.call_id,
      applicantId: application.applicant_id,
      direction: application.calls?.direction || 'SALIENTE',
      student: application.profiles?.full_name || application.profiles?.email || 'Estudiante',
      code: application.student_code || 'Pendiente',
      faculty: application.faculty || 'Pendiente',
      academicProgram: application.academic_program || '',
      destination: application.calls?.title || 'Convocatoria',
      callTitle: application.calls?.title || 'Convocatoria',
      status: application.status,
      submitted: date ? shortDate(String(date).slice(0, 10)) : 'Borrador',
      progress,
      documents: documents.map((document) => ({
        id: document.id,
        requirementId: document.requirement_id,
        name: document.requirement_title,
        required: document.is_required,
        storagePath: document.storage_path || '',
        fileName: document.file_name || '',
        status: document.status,
        reviewerComment: document.reviewer_comment || '',
      })),
      history: [
        [
          application.status.replaceAll('_', ' '),
          date ? new Date(date).toLocaleDateString('es-PE') : 'Sin fecha',
        ],
      ],
    };
  });
}

async function loadAcademicCatalog() {
  if (!supabase || !session || session.role !== 'student') {
    academicCatalog = [];
    return;
  }

  const { data, error } = await supabase
    .from('unsaac_faculties')
    .select(
      'code,name,display_order,unsaac_professional_schools(code,name,display_order,is_active)',
    )
    .eq('is_active', true)
    .order('display_order')
    .order('display_order', {
      referencedTable: 'unsaac_professional_schools',
    });

  if (error) {
    console.warn('No se pudo cargar el catálogo académico UNSAAC.', error.message);
    academicCatalog = [];
    return;
  }

  academicCatalog = data.map((faculty) => ({
    code: faculty.code,
    name: faculty.name,
    schools: (faculty.unsaac_professional_schools || []).filter((school) => school.is_active),
  }));
}

async function uploadDataUrl(dataUrl, path) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const { error } = await supabase.storage.from('call-assets').upload(path, blob, { upsert: true });
  if (error) throw error;
  return path;
}
function toast(msg) {
  const e = $('#toast');
  e.textContent = msg;
  e.classList.add('show');
  setTimeout(() => e.classList.remove('show'), 2300);
}
function badge(status) {
  const s = STATUS_LABELS[status] || status.replaceAll('_', ' ');
  const cls = /APROBAD|ACTIVA|COMPLETO|CONFIRMADO/.test(status)
    ? 'ok'
    : /OBSERVAD|RECHAZAD/.test(status)
      ? 'bad'
      : /REVISION|VALIDACION|ENVIADA|SUBIDO/.test(status)
        ? 'info'
        : /PENDIENTE|BORRADOR|INVITACION/.test(status)
          ? 'warn'
          : 'neutral';
  return html`<span class="badge ${cls}">${esc(s)}</span>`;
}

function stopLoginAnimation() {
  loginAnimation?.destroy();
  loginAnimation = null;
}

function distributeLoginAirplanes(container, compactScreen) {
  const columns = compactScreen ? 4 : 7;
  const rows = compactScreen ? 4 : 5;
  const { width, height } = container.canvas.size;
  const cellWidth = width / columns;
  const cellHeight = height / rows;

  container.particles.clear();

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const horizontalOffset = (((row + column) % 3) - 1) * cellWidth * 0.16;
      const verticalOffset = (((row * 2 + column) % 3) - 1) * cellHeight * 0.12;

      container.particles.addParticle({
        x: (column + 0.5) * cellWidth + horizontalOffset,
        y: (row + 0.5) * cellHeight + verticalOffset,
      });
    }
  }
}

async function startLoginAnimation() {
  const scene = document.querySelector('#sigma-travel-scene');
  if (!scene || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  await particleLibraryReady;

  // El DOM puede haber cambiado mientras se cargaba la librería.
  if (!document.body.contains(scene)) return;

  const compactScreen = window.matchMedia('(max-width: 760px)').matches;
  loginAnimation = await tsParticles.load({
    id: 'sigma-travel-scene',
    options: {
      fullScreen: { enable: false },
      fpsLimit: 45,
      detectRetina: true,
      interactivity: {
        detectsOn: 'canvas',
        events: {
          onClick: { enable: false, mode: 'repulse' },
          onHover: { enable: true, mode: 'grab' },
          resize: { enable: true },
        },
        modes: {
          grab: {
            distance: compactScreen ? 95 : 175,
            links: {
              color: '#ead8b4',
              opacity: compactScreen ? 0.16 : 0.24,
            },
          },
        },
      },
      particles: {
        number: {
          value: compactScreen ? 16 : 35,
          density: { enable: false },
        },
        color: { value: ['#c9bca9', '#ead8b4', '#95877e'] },
        shape: {
          type: 'image',
          options: {
            image: {
              src: sigmaAirplaneUrl,
              width: 128,
              height: 64,
              replaceColor: true,
            },
          },
        },
        opacity: {
          value: { min: 0.13, max: 0.3 },
        },
        size: {
          value: compactScreen ? { min: 5, max: 9 } : { min: 7, max: 13 },
        },
        links: {
          enable: false,
          color: '#ead8b4',
          opacity: 0.2,
          width: 1,
        },
        rotate: {
          value: { min: -8, max: 8 },
          direction: 'random',
          animation: { enable: false },
        },
        move: {
          enable: true,
          direction: 'left',
          speed: { min: 0.45, max: 1.1 },
          straight: false,
          random: true,
          outModes: { default: 'out' },
        },
      },
    },
  });

  distributeLoginAirplanes(loginAnimation, compactScreen);
}

// -----------------------------------------------------------------------------
// Autenticación, registro y sesión (Supabase Auth)
// -----------------------------------------------------------------------------
// El acceso usa dos momentos: una portada institucional mínima y, después,
// el formulario elegido por la persona sin repetir la identidad superior.
function authShell({
  cardEyebrow = '',
  cardTitle = '',
  cardSub = '',
  body,
  foot = '',
  showIdentity = true,
  bareBody = false,
}) {
  return html`<main class="sgmee-shell login-entry">
    <div id="sigma-travel-scene" class="login-travel-scene" aria-hidden="true"></div>
    <svg class="login-routes" viewBox="0 0 1440 900" preserveAspectRatio="none" aria-hidden="true">
      <path d="M-100 700 C 210 480, 430 735, 750 490 S 1190 270, 1520 390" />
      <path d="M-50 245 C 275 80, 520 315, 770 205 S 1170 40, 1490 190" />
      <path d="M185 930 C 400 710, 650 790, 910 590 S 1250 515, 1490 640" />
      <path d="M-80 455 C 245 350, 425 390, 655 315 S 1120 420, 1510 295" />
      <path d="M40 825 C 255 650, 520 590, 740 690 S 1150 840, 1465 735" />
      <path d="M320 -40 C 390 190, 590 270, 810 350 S 1140 530, 1430 535" />
      <circle cx="365" cy="570" r="5" />
      <circle cx="760" cy="475" r="5" />
      <circle cx="1190" cy="315" r="5" />
      <circle cx="655" cy="315" r="4" />
      <circle cx="910" cy="590" r="4" />
      <circle cx="1260" cy="735" r="4" />
    </svg>
    <div class="sgmee-center ${showIdentity ? '' : 'sgmee-form-only'}">
      ${
        showIdentity
          ? html`<div class="sgmee-identity">
              <p class="sgmee-office">Oficina de Cooperación y Relaciones Internacionales</p>
              <img class="sgmee-shield" src="${unsaacShieldUrl}" alt="Escudo de la UNSAAC" />
              <h1 class="sgmee-title">SIGMA</h1>
              <p class="sgmee-sub">Sistema Integral de Gestión de Movilidad Académica · UNSAAC</p>
            </div>`
          : ''
      }
      ${
        bareBody
          ? body
          : html`<section class="sgmee-card" aria-label="${esc(cardTitle)}">
              <p class="sgmee-card-eyebrow">${cardEyebrow}</p>
              <h2>${cardTitle}</h2>
              <p class="sgmee-card-sub">${cardSub}</p>
              ${body}
            </section>`
      }
      ${foot}
    </div>
  </main>`;
}

function login() {
  stopLoginAnimation();
  session = null;
  $('#app').innerHTML = authShell({
    bareBody: true,
    body: html`<div class="sgmee-choice-card" aria-label="Opciones de acceso">
      <button class="sgmee-choice-primary" type="button" onclick="showLoginForm()">
        Iniciar sesión
      </button>
      <button class="sgmee-choice-secondary" type="button" onclick="showRegister()">
        Crear cuenta
      </button>
    </div>`,
  });
  void startLoginAnimation();
}

function showLoginForm() {
  stopLoginAnimation();
  const body = supabase
    ? html`<form class="sgmee-form" onsubmit="signIn(event)">
          <div class="field">
            <label for="sgmee-email">Correo electrónico</label>
            <input
              class="input sgmee-input"
              id="sgmee-email"
              name="email"
              type="email"
              autocomplete="email"
              placeholder="codigo@unsaac.edu.pe"
              required
            />
          </div>
          <div class="field">
            <label for="sgmee-password">Contraseña</label>
            <div class="sgmee-password-wrap">
              <input
                class="input sgmee-input"
                id="sgmee-password"
                name="password"
                type="password"
                autocomplete="current-password"
                placeholder="Tu contraseña"
                required
              />
              <button
                type="button"
                class="sgmee-eye"
                onclick="togglePassword('sgmee-password', this)"
                aria-label="Mostrar u ocultar contraseña"
              >
                ◌
              </button>
            </div>
          </div>
          <button class="btn sgmee-primary" type="submit">Iniciar sesión</button>
        </form>
        <div class="sgmee-links">
          <button type="button" class="sgmee-link" onclick="showRegister()">Crear cuenta</button>
          <span class="sgmee-dot" aria-hidden="true">·</span>
          <button type="button" class="sgmee-link" onclick="showRecover()">
            Recuperar contraseña
          </button>
        </div>
        <button type="button" class="sgmee-back" onclick="login()">← Volver</button>`
    : html`<p class="sgmee-note">
        Falta la configuración local de Supabase. Copie <code>.env.example</code> a
        <code>.env.local</code> antes de iniciar la aplicación.
      </p>`;
  $('#app').innerHTML = authShell({
    cardEyebrow: 'Bienvenido',
    cardTitle: 'Iniciar sesión',
    cardSub: 'Ingresa con el correo y la contraseña de tu cuenta verificada.',
    body,
    showIdentity: false,
  });
  void startLoginAnimation();
}

function togglePassword(inputId, button) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  if (button) button.textContent = visible ? '◌' : '●';
  input.focus();
}

function showRecover() {
  stopLoginAnimation();
  $('#app').innerHTML = authShell({
    cardEyebrow: 'Recuperar acceso',
    cardTitle: 'Recuperar contraseña',
    cardSub: 'Te enviaremos un enlace para definir una nueva contraseña.',
    body: html`<form class="sgmee-form" onsubmit="requestPasswordReset(event)">
        <div class="field">
          <label for="sgmee-recover-email">Correo electrónico</label>
          <input
            class="input sgmee-input"
            id="sgmee-recover-email"
            name="email"
            type="email"
            autocomplete="email"
            placeholder="codigo@unsaac.edu.pe"
            required
          />
        </div>
        <button class="btn sgmee-primary" type="submit">Enviar enlace</button>
      </form>
      <div class="sgmee-links">
        <button type="button" class="sgmee-link" onclick="showLoginForm()">
          ← Volver a iniciar sesión
        </button>
        <span class="sgmee-dot" aria-hidden="true">·</span>
        <button type="button" class="sgmee-link" onclick="showRegister()">Crear cuenta</button>
      </div>`,
    showIdentity: false,
  });
  void startLoginAnimation();
}
// Acceso ordinario: solo correo y contraseña; el enlace se reserva para verificar o recuperar.
async function signIn(event) {
  event.preventDefault();
  const f = Object.fromEntries(new FormData(event.target));
  const { error } = await supabase.auth.signInWithPassword({
    email: f.email,
    password: f.password,
  });
  if (error) toast('Correo o contraseña incorrectos.');
}
async function requestPasswordReset(event) {
  event?.preventDefault?.();
  const form = event?.target?.closest
    ? event.target.closest('form')
    : document.querySelector('.sgmee-form');
  const email = form
    ? new FormData(form).get('email')?.toString().trim()
    : document.querySelector('[name="email"]')?.value?.trim();
  if (!email) return toast('Ingrese primero su correo.');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  toast(error ? error.message : 'Enlace de recuperación enviado. Revise su correo.');
  if (!error) login();
}
function showRegister() {
  stopLoginAnimation();
  $('#app').innerHTML = authShell({
    cardEyebrow: 'Registro',
    cardTitle: 'Crear cuenta',
    cardSub: 'Verificaremos que el correo le pertenece. Después podrá crear su contraseña.',
    body: html`<form class="sgmee-form" onsubmit="register(event)">
        <div class="field">
          <label for="sgmee-name">Nombre completo</label>
          <input
            class="input sgmee-input"
            id="sgmee-name"
            name="fullName"
            autocomplete="name"
            placeholder="Nombres y apellidos"
            required
          />
        </div>
        <div class="field">
          <label for="sgmee-new-email">Correo institucional o universitario</label>
          <input
            class="input sgmee-input"
            id="sgmee-new-email"
            name="email"
            type="email"
            autocomplete="email"
            placeholder="codigo@unsaac.edu.pe"
            required
          />
        </div>
        <button class="btn sgmee-primary" type="submit">Enviar verificación</button>
      </form>
      <div class="sgmee-links">
        <button type="button" class="sgmee-link" onclick="showLoginForm()">
          ← Volver a iniciar sesión
        </button>
        <span class="sgmee-dot" aria-hidden="true">·</span>
        <button type="button" class="sgmee-link" onclick="showRecover()">
          Recuperar contraseña
        </button>
      </div>`,
    showIdentity: false,
  });
  void startLoginAnimation();
}
async function register(event) {
  event.preventDefault();
  const f = Object.fromEntries(new FormData(event.target));
  const { data: approved, error: domainError } = await supabase.rpc(
    'is_registration_domain_approved',
    { candidate_email: f.email },
  );
  if (domainError) return toast('No fue posible validar el dominio institucional.');
  if (!approved)
    return toast(
      'No puede registrarse: necesita un correo de una universidad con asociación o convenio vigente con UNSAAC.',
    );
  const { error } = await supabase.auth.signInWithOtp({
    email: f.email,
    options: {
      shouldCreateUser: true,
      data: { full_name: f.fullName },
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) return toast(error.message);
  login();
  toast('Enlace de verificación enviado. Revise su correo.');
}
function passwordSetup() {
  stopLoginAnimation();
  const recovery = passwordRecoveryMode;
  $('#app').innerHTML = authShell({
    cardEyebrow: recovery ? 'Recuperación' : 'Último paso',
    cardTitle: recovery ? 'Nueva contraseña' : 'Crea tu contraseña',
    cardSub: 'Tu correo ya fue verificado. Usa esta contraseña junto con tu correo.',
    body: html`<form class="sgmee-form" onsubmit="setPassword(event)">
      <div class="field">
        <label for="sgmee-new-pass">Nueva contraseña</label>
        <div class="sgmee-password-wrap">
          <input
            class="input sgmee-input"
            id="sgmee-new-pass"
            name="password"
            type="password"
            autocomplete="new-password"
            minlength="8"
            placeholder="Mínimo 8 caracteres"
            required
          />
          <button
            type="button"
            class="sgmee-eye"
            onclick="togglePassword('sgmee-new-pass', this)"
            aria-label="Mostrar u ocultar contraseña"
          >
            ◌
          </button>
        </div>
      </div>
      <div class="field">
        <label for="sgmee-confirm-pass">Confirmar contraseña</label>
        <input
          class="input sgmee-input"
          id="sgmee-confirm-pass"
          name="confirmation"
          type="password"
          autocomplete="new-password"
          minlength="8"
          placeholder="Repite tu contraseña"
          required
        />
      </div>
      <button class="btn sgmee-primary" type="submit">Guardar contraseña</button>
    </form>`,
    showIdentity: false,
  });
}
async function setPassword(event) {
  event.preventDefault();
  const f = Object.fromEntries(new FormData(event.target));
  if (f.password !== f.confirmation) return toast('Las contraseñas no coinciden.');
  const { error } = await supabase.auth.updateUser({ password: f.password });
  if (error) return toast(error.message);
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ password_configured_at: new Date().toISOString() })
    .eq('user_id', session.userId);
  if (profileError) return toast(profileError.message);
  passwordRecoveryMode = false;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await loadSession(user);
  toast('Contraseña configurada correctamente.');
}
async function signOut() {
  await supabase.auth.signOut();
  login();
  toast('Sesión cerrada');
}
async function loadSession(user) {
  const previousUserId = session?.userId;
  const [{ data: profileResult, error: profileError }, { data: roleResult, error: roleError }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select(
          'full_name,status,email,password_configured_at,phone,address,photo_path,universities(name)',
        )
        .eq('user_id', user.id)
        .single(),
      supabase.from('user_roles').select('roles(code,name)').eq('user_id', user.id).limit(1),
    ]);
  if (profileError) {
    toast(`No se pudo cargar el perfil: ${profileError.message}`);
    return login();
  }
  if (roleError) {
    toast(`No se pudo cargar el rol: ${roleError.message}`);
    return login();
  }
  const roleCode = roleResult?.[0]?.roles?.code;
  const fullName = profileResult.full_name || user.user_metadata?.full_name || user.email;
  const signedPhoto = profileResult.photo_path
    ? await supabase.storage
        .from('profile-photos')
        .createSignedUrl(profileResult.photo_path, 60 * 30)
    : null;
  const photoUrl = signedPhoto?.data?.signedUrl
    ? `${signedPhoto.data.signedUrl}&updated=${Date.now()}`
    : '';
  session = {
    userId: user.id,
    email: user.email,
    name: fullName,
    label: roleCode ? ROLE_LABELS[roleCode] : `Cuenta ${profileResult.status.toLowerCase()}`,
    initials: fullName
      .split(/\s+/)
      .slice(0, 2)
      .map((n) => n[0])
      .join('')
      .toUpperCase(),
    role: ROLE_VIEWS[roleCode] || 'pending',
    status: profileResult.status,
    university: profileResult.universities?.name || null,
    phone: profileResult.phone || '',
    address: profileResult.address || '',
    photoPath: profileResult.photo_path || '',
    photoUrl,
  };
  if (passwordRecoveryMode || !profileResult.password_configured_at) return passwordSetup();
  if (previousUserId !== user.id) route = 'dashboard';
  await Promise.all([
    loadCallsFromDatabase(),
    loadApplicationsFromDatabase(),
    loadAcademicCatalog(),
  ]);
  render();
}
function portalMeta() {
  if (session.role === 'student')
    return {
      module: 'MOVILIDAD SALIENTE · SGMS',
      section: 'MI MOVILIDAD',
      menu: [
        ['dashboard', 'Inicio'],
        ['calls', 'Convocatorias'],
        ['sgms', 'Mis postulaciones'],
      ],
    };
  if (session.role === 'external')
    return {
      module: 'MOVILIDAD ENTRANTE · SGME',
      section: 'MI MOVILIDAD',
      menu: [
        ['dashboard', 'Inicio'],
        ['calls', 'Convocatorias'],
        ['sgme', 'Mis postulaciones'],
      ],
    };
  if (session.role === 'external_manager')
    return {
      module: 'SGME · GESTOR EXTERNO',
      section: (session.university || 'Universidad asociada').toUpperCase(),
      menu: [
        ['dashboard', 'Resumen'],
        ['calls', 'Convocatorias'],
        ['nominations', 'Nominaciones'],
        ['manager_students', 'Estudiantes'],
        ['manager_results', 'Resultados'],
      ],
    };
  return {
    module: 'OFICINA DE COOPERACIÓN Y RELACIONES INTERNACIONALES',
    section: 'PANEL OCRI',
    menu: [
      ['dashboard', 'Panel general'],
      ['calls', 'Convocatorias'],
      ['applications', 'Expedientes'],
      ['nominations', 'Nominaciones entrantes'],
      ['access', 'Universidades y usuarios'],
      ['reports', 'Reportes'],
    ],
  };
}

// -----------------------------------------------------------------------------
// Estructura del portal y vistas por rol
// -----------------------------------------------------------------------------
function render() {
  stopLoginAnimation();
  if (!session) return login();
  if (session.role === 'pending') return accessPending();
  if (session.role === 'student' && ['documents', 'tracking'].includes(route)) route = 'sgms';
  if (session.role === 'external' && ['documents', 'tracking'].includes(route)) route = 'sgme';
  const portal = portalMeta();
  if (![...portal.menu.map(([target]) => target), 'profile'].includes(route)) route = 'dashboard';
  const navigation = portal.menu
    .map(
      ([target, label]) =>
        html`<button class="${target === route ? 'active' : ''}" onclick="go('${target}')">
          ${label}
        </button>`,
    )
    .join('');
  if (['student', 'external'].includes(session.role))
    return renderMobilityStudentPortal(portal, navigation);
  const context = session.role === 'admin' ? 'Gestión institucional · OCRI' : esc(session.name);
  $('#app').innerHTML = html`<div class="portal-shell">
    <header class="portal-header">
      <div class="portal-header-start">
        <button
          class="icon-button mobile-menu"
          aria-label="Abrir navegación"
          onclick="$('#sidebar').classList.toggle('open')"
        >
          ☰</button
        ><strong class="portal-wordmark">SIGMA</strong
        ><span class="portal-module">${portal.module}</span>
      </div>
      <div class="portal-header-end">
        <span class="portal-context">${context}</span>
        <i aria-label="Escudo UNSAAC"></i>
      </div>
    </header>
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-section">${esc(portal.section)}</div>
        <nav class="nav">${navigation}</nav>
        <div class="sidebar-foot">
          <button class="sidebar-profile" onclick="go('profile')" title="Abrir mi perfil">
            <span class="sidebar-avatar">
              ${
                session.photoUrl
                  ? html`<img src="${esc(session.photoUrl)}" alt="" />`
                  : esc(session.initials)
              }
            </span>
            <span class="sidebar-profile-copy">
              <strong>${esc(session.name)}</strong>
              <small>Mi perfil</small>
            </span>
          </button>
          <button class="logout" onclick="signOut()">Cerrar sesión</button>
        </div>
      </aside>
      <main class="main"><section class="content" id="view"></section></main>
    </div>
  </div>`;
  views[route]?.();
}
function renderMobilityStudentPortal(portal, navigation) {
  const photo = session.photoUrl
    ? html`<img src="${esc(session.photoUrl)}" alt="" />`
    : esc(session.initials);
  $('#app').innerHTML = html`<div class="portal-shell student-portal">
    <header class="portal-header student-header">
      <div class="portal-header-start">
        <strong class="portal-wordmark">SIGMA</strong>
        <span class="portal-module">${portal.module}</span>
      </div>
      <nav class="student-desktop-nav" aria-label="Navegación principal">${navigation}</nav>
      <div class="student-account">
        <button
          class="student-account-trigger"
          type="button"
          onclick="toggleStudentAccountMenu()"
          aria-label="Abrir opciones de cuenta"
        >
          <span class="sidebar-avatar">${photo}</span>
          <span class="student-account-copy">
            <strong>${esc(session.name)}</strong>
            <small
              >${session.role === 'student' ? 'Estudiante UNSAAC' : 'Estudiante externo'}</small
            >
          </span>
          <span aria-hidden="true">⌄</span>
        </button>
        <div class="student-account-menu hidden" id="studentAccountMenu">
          <button type="button" onclick="go('profile')">Mi perfil</button>
          <button type="button" onclick="signOut()">Cerrar sesión</button>
        </div>
      </div>
    </header>
    <main class="main student-main"><section class="content" id="view"></section></main>
    <nav class="student-mobile-nav" aria-label="Navegación móvil">${navigation}</nav>
  </div>`;
  views[route]?.();
}
function toggleStudentAccountMenu() {
  $('#studentAccountMenu')?.classList.toggle('hidden');
}
function accessPending() {
  stopLoginAnimation();
  $('#app').innerHTML = authShell({
    cardEyebrow: 'Acceso restringido',
    cardTitle: 'Cuenta pendiente',
    cardSub: `Se creó el perfil para <strong>${esc(session.email)}</strong>. OCRI validará tu identidad antes de asignarte un rol.`,
    body: html`<div class="sgmee-status">${badge(session.status)}</div>
      <button class="btn sgmee-primary" type="button" onclick="signOut()">Cerrar sesión</button>`,
    showIdentity: false,
  });
}
function go(r) {
  if (
    (r === 'sgms' && session?.role === 'student') ||
    (r === 'sgme' && session?.role === 'external')
  )
    selectedStudentApplicationId = null;
  route = r;
  render();
}
function head(title, desc, action = '') {
  return html`<div class="page-head">
    <div>
      <h1>${title}</h1>
      <p>${desc}</p>
    </div>
    ${action}
  </div>`;
}
function filteredApps(dir) {
  let a = state.applications.filter((x) => x.direction === dir);
  if (['student', 'external'].includes(session.role))
    a = a.filter((x) => x.applicantId === session.userId);
  if (session.role === 'external_manager')
    a = a.filter((x) => session.university && x.destination.includes(session.university));
  return a;
}

// Cada vista llena únicamente el contenedor #view de la estructura principal.
const views = {
  async access() {
    const view = $('#view');
    view.innerHTML =
      head(
        'Administración de accesos',
        'OCRI aprueba universidades y designa directamente a los gestores externos.',
      ) + '<div class="card">Cargando información de acceso…</div>';
    const [
      { data: universities, error: universityError },
      { data: profiles, error: profileError },
    ] = await Promise.all([
      supabase
        .from('universities')
        .select(
          'id,name,country,is_unsaac,is_active,university_email_domains(email_domain,is_verified,is_active)',
        )
        .order('is_unsaac', { ascending: false })
        .order('name'),
      supabase
        .from('profiles')
        .select(
          'user_id,email,full_name,status,universities(id,name),user_roles!user_roles_user_id_fkey(roles(code,name))',
        )
        .order('created_at', { ascending: false }),
    ]);
    if (universityError || profileError) {
      view.innerHTML =
        head('Administración de accesos', 'No fue posible cargar los datos.') +
        html`<div class="card">${esc(universityError?.message || profileError?.message)}</div>`;
      return;
    }
    accessProfiles = profiles;
    const externalUniversities = universities.filter((u) => !u.is_unsaac),
      managers = profiles.filter((p) =>
        p.user_roles?.some((ur) => ur.roles?.code === 'GESTOR_EXTERNO'),
      );
    view.innerHTML =
      head(
        'Administración de accesos',
        'OCRI aprueba universidades y designa directamente a los gestores externos.',
        html`<button class="btn btn-primary" onclick="universityModal()">
          + Registrar universidad
        </button>`,
      ) +
      html`<div class="grid-2">
        <div class="card">
          <div class="section-title">
            <h3>Universidades y dominios</h3>
            <span class="badge info">${universities.length}</span>
          </div>
          ${universities
            .map(
              (u) =>
                html`<div class="doc-item">
                  <div class="doc-icon">UNI</div>
                  <div class="doc-main">
                    <strong>${esc(u.name)}</strong
                    ><small
                      >${esc(u.country || 'Sin país')} ·
                      ${(u.university_email_domains || []).map((d) => esc(d.email_domain)).join(', ') || 'Sin dominio'}</small
                    >
                  </div>
                  ${badge(u.is_active ? 'ACTIVA' : 'SUSPENDIDA')}
                </div>`,
            )
            .join('')}
        </div>
        <div class="card">
          <h3>Designar gestor externo</h3>
          <p class="muted">Escriba el correo institucional de la persona oficialmente designada.</p>
          <form class="form-grid" onsubmit="designateExternalManager(event)">
            <div class="field wide">
              <label>Correo de la persona designada</label
              ><input
                class="input"
                name="email"
                type="email"
                placeholder="encargado@universidad.edu"
                required
              />
            </div>
            <div class="modal-actions wide">
              <button class="btn btn-primary">Asignar GESTOR EXTERNO</button>
            </div>
          </form>
          <h3 style="margin-top:28px">Gestores por universidad</h3>
          ${
            externalUniversities.length
              ? externalUniversities
                  .map((u) => {
                    const manager = managers.find((p) => p.universities?.id === u.id);
                    return html`<div class="doc-item">
                      <div class="doc-icon">EXT</div>
                      <div class="doc-main">
                        <strong>${esc(u.name)}</strong
                        ><small
                          >${manager ? esc(manager.full_name || manager.email) + ' · ' + esc(manager.email) : 'Sin gestor asignado'}</small
                        >
                      </div>
                      ${manager ? badge('ACTIVO') : badge('PENDIENTE')}
                    </div>`;
                  })
                  .join('')
              : '<p class="muted">Aún no hay universidades externas aprobadas.</p>'
          }
        </div>
      </div>`;
  },
  dashboard() {
    const apps = state.applications;
    if (session.role === 'student') return studentDashboard();
    if (session.role === 'external') return externalStudentDashboard();
    if (session.role === 'external_manager') return managerDashboard();
    return adminDashboard(apps);
  },
  calls() {
    const canEdit = /admin/.test(session.role);
    const visibleCalls = state.calls.filter((call) => {
      if (session.role === 'student') return call.direction === 'SALIENTE';
      if (session.role === 'external') return call.direction === 'ENTRANTE';
      if (session.role === 'external_manager') return call.direction === 'ENTRANTE';
      return true;
    });
    const showDirectionFilter = canEdit;
    const activeApplication = ['student', 'external'].includes(session.role)
      ? getActiveMobilityApplication()
      : null;
    $('#view').innerHTML =
      head(
        'Convocatorias',
        'Oportunidades y periodos de movilidad académica.',
        canEdit
          ? html`<button class="btn btn-primary" onclick="callModal()">
              + Nueva convocatoria
            </button>`
          : '',
      ) +
      html`${
          activeApplication
            ? html`<aside class="student-call-notice">
                <div>
                  <strong>Ya tienes una postulación activa</strong>
                  <span>Podrás iniciar otra cuando este proceso finalice o no sea admitido.</span>
                </div>
                <button
                  class="btn btn-soft"
                  type="button"
                  onclick="openStudentApplication('${activeApplication.id}')"
                >
                  Ver mi postulación activa
                </button>
              </aside>`
            : session.role === 'external'
              ? html`<aside class="student-call-notice is-inbound">
                  <div>
                    <strong>El proceso comienza con una nominación</strong>
                    <span
                      >Tu universidad de origen debe nominarte. Después recibirás una invitación
                      para completar tu expediente en SIGMA.</span
                    >
                  </div>
                </aside>`
              : ''
        }${
          showDirectionFilter
            ? html`<div class="filters">
                <select class="input" onchange="filterCards(this.value)">
                  <option value="">Todas las direcciones</option>
                  <option>SALIENTE</option>
                  <option>ENTRANTE</option>
                </select>
              </div>`
            : ''
        }
        <div class="call-grid" id="callGrid">
          ${
            visibleCalls.length
              ? visibleCalls.map((call) => callCard(call, canEdit)).join('')
              : '<div class="empty">No hay convocatorias disponibles en este momento.</div>'
          }
        </div>`;
  },
  sgms() {
    if (session.role === 'student') return studentApplicationsView();
    appView(
      'SALIENTE',
      'SGMS · Movilidad saliente',
      'Postulaciones de alumnos UNSAAC hacia universidades de destino.',
    );
  },
  sgme() {
    if (session.role === 'external') return studentApplicationsView('ENTRANTE');
    appView(
      'ENTRANTE',
      'SGME · Movilidad entrante',
      'Postulaciones de estudiantes externos hacia la UNSAAC.',
    );
  },
  applications() {
    adminApplicationsView();
  },
  academic_review() {
    academicReviewView();
  },
  letters() {
    lettersView();
  },
  audit() {
    auditView();
  },
  manager_students() {
    managerStudentsView();
  },
  manager_results() {
    managerResultsView();
  },
  nominations() {
    const action = /admin|external_manager/.test(session.role)
      ? html`<button class="btn btn-primary" onclick="nominationModal()">
          + Nueva nominación
        </button>`
      : '';
    const nominations =
      session.role === 'external_manager'
        ? state.nominations.filter((n) => n.university === session.university)
        : state.nominations;
    const isAdmin = session.role === 'admin';
    $('#view').innerHTML =
      head(
        isAdmin ? 'Nominaciones recibidas · SGME' : 'Nominaciones de tu universidad',
        isAdmin
          ? 'Estudiantes propuestos por universidades asociadas para realizar movilidad entrante en la UNSAAC. No corresponde a postulaciones salientes de estudiantes UNSAAC.'
          : `Procesos de ${session.university || 'su universidad'} hacia la UNSAAC.`,
        action,
      ) + html`<div class="card">${nomTable(nominations)}</div>`;
  },
  documents() {
    let apps = state.applications;
    if (session.role === 'student') apps = filteredApps('SALIENTE');
    if (session.role === 'external') apps = filteredApps('ENTRANTE');
    const docs = apps.flatMap((a) => a.documents.map((d, i) => ({ ...d, app: a, index: i })));
    $('#view').innerHTML =
      head(
        'Gestión documental',
        'Revisión individual, observaciones y trazabilidad de documentos.',
      ) +
      html`<div class="card">
        <div class="doc-list">
          ${docs
            .map(
              (d) =>
                html`<div class="doc-item">
                  <div class="doc-icon">PDF</div>
                  <div class="doc-main">
                    <strong>${esc(d.name)}</strong
                    ><small>${d.app.id} · ${esc(d.app.student)}</small>
                  </div>
                  ${badge(d.status)}${/admin|reviewer/.test(session.role) ? html`<button class="btn btn-sm btn-soft" onclick="reviewModal('${d.app.id}',${d.index})">Revisar</button>` : ''}
                </div>`,
            )
            .join('')}
        </div>
      </div>`;
  },
  reports() {
    const faculties = {};
    state.applications.forEach((a) => (faculties[a.faculty] = (faculties[a.faculty] || 0) + 1));
    $('#view').innerHTML =
      head(
        'Reportes',
        'Indicadores consolidados y exportación de información.',
        html`<button class="btn btn-primary" onclick="exportCSV()">Exportar CSV</button>`,
      ) +
      html`<div class="cards">
          <div class="card stat">
            <div class="stat-label">Salientes</div>
            <div class="stat-value">${filteredApps('SALIENTE').length}</div>
          </div>
          <div class="card stat">
            <div class="stat-label">Entrantes</div>
            <div class="stat-value">${filteredApps('ENTRANTE').length}</div>
          </div>
          <div class="card stat">
            <div class="stat-label">Convocatorias</div>
            <div class="stat-value">${state.calls.length}</div>
          </div>
          <div class="card stat">
            <div class="stat-label">Expedientes concluidos</div>
            <div class="stat-value">
              ${state.applications.filter((a) => /CONCLUID|FINALIZAD/.test(a.status)).length}
            </div>
          </div>
        </div>
        <div class="grid-2">
          <div class="card">
            <h3>Postulantes por facultad</h3>
            ${Object.entries(faculties)
              .map(
                ([f, n]) =>
                  html`<p>${esc(f)} <strong style="float:right">${n}</strong></p>
                    <div class="progress">
                      <span
                        style="width:${(100 * n) / Math.max(state.applications.length, 1)}%"
                      ></span>
                    </div>`,
              )
              .join('')}
          </div>
          <div class="card">
            <h3>Estado de expedientes</h3>
            ${state.applications.map((a) => html`<p style="display:flex;justify-content:space-between"><span>${a.id}</span>${badge(a.status)}</p>`).join('')}
          </div>
        </div>`;
  },
  tracking() {
    trackingView();
  },
  profile() {
    profileView();
  },
};
function appView(dir, title, desc) {
  const apps = filteredApps(dir);
  const action =
    (session.role === 'student' && dir === 'SALIENTE') ||
    (session.role === 'external' && dir === 'ENTRANTE')
      ? html`<button class="btn btn-primary" onclick="go('calls')">Explorar convocatorias</button>`
      : '';
  $('#view').innerHTML =
    head(title, desc, action) +
    html`<div class="cards">
        <div class="card stat">
          <div class="stat-label">Total</div>
          <div class="stat-value">${apps.length}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">En proceso</div>
          <div class="stat-value">
            ${apps.filter((a) => !/APROBAD|FINALIZAD/.test(a.status)).length}
          </div>
        </div>
        <div class="card stat">
          <div class="stat-label">Observados</div>
          <div class="stat-value">${apps.filter((a) => a.status === 'OBSERVADO').length}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Aprobados</div>
          <div class="stat-value">${apps.filter((a) => /APROBAD/.test(a.status)).length}</div>
        </div>
      </div>
      <div class="card">
        ${apps.length ? appTable(apps) : '<div class="empty">No hay postulaciones registradas.</div>'}
      </div>`;
}
function getStudentApplications() {
  return filteredApps('SALIENTE');
}
function getMobilityApplications(
  direction = session.role === 'external' ? 'ENTRANTE' : 'SALIENTE',
) {
  return filteredApps(direction);
}
function isClosedApplication(application) {
  return /FINALIZAD|CONCLUID|RECHAZAD|NO_ADMITID|NO_ACEPTAD|CANCELAD/.test(application.status);
}
function getActiveStudentApplication() {
  return getStudentApplications().find((application) => !isClosedApplication(application)) || null;
}
function getActiveMobilityApplication() {
  return getMobilityApplications().find((application) => !isClosedApplication(application)) || null;
}
function openStudentApplication(id) {
  closeModal();
  selectedStudentApplicationId = id;
  route = session.role === 'external' ? 'sgme' : 'sgms';
  render();
}
function studentApplicationCard(application, active = false) {
  const call = state.calls.find((item) => item.id === application.callId);
  const uploaded = application.documents.filter((document) => document.storagePath).length;
  return html`<article class="student-application-card ${active ? 'is-active' : ''}">
    <div class="student-application-card-top">
      <span>${active ? 'Postulación activa' : esc(call?.period || application.submitted)}</span>
      ${badge(application.status)}
    </div>
    <h3>${esc(call?.title || application.callTitle)}</h3>
    <p>${application.displayId || application.id}</p>
    <div class="student-application-progress">
      <span>${uploaded} de ${application.documents.length} documentos cargados</span>
      <strong>${application.progress}%</strong>
    </div>
    <div class="progress"><span style="width:${application.progress}%"></span></div>
    <button
      class="btn ${active ? 'btn-primary' : 'btn-soft'}"
      onclick="openStudentApplication('${application.id}')"
    >
      Ver postulación
    </button>
  </article>`;
}
function studentApplicationsView(direction = 'SALIENTE') {
  const isInbound = direction === 'ENTRANTE';
  const applications = getMobilityApplications(direction);
  const selected = applications.find(
    (application) => application.id === selectedStudentApplicationId,
  );
  if (selected) return studentApplicationDetailView(selected);

  const active = applications.find((application) => !isClosedApplication(application)) || null;
  const history = applications.filter((application) => application.id !== active?.id);
  $('#view').innerHTML =
    head(
      'Mis postulaciones',
      isInbound
        ? 'Consulta la postulación iniciada desde la nominación de tu universidad de origen.'
        : 'Consulta tu proceso activo y el historial de tus movilidades desde un solo lugar.',
      !active && !isInbound
        ? html`<button class="btn btn-primary" onclick="go('calls')">
            Explorar convocatorias
          </button>`
        : '',
    ) +
    html`<section class="student-applications-section">
        <div class="student-section-heading">
          <div>
            <span>Proceso actual</span>
            <h2>Postulación activa</h2>
          </div>
        </div>
        ${
          active
            ? studentApplicationCard(active, true)
            : html`<div class="student-applications-empty">
                <h3>No tienes una postulación activa</h3>
                <p>
                  ${
                    isInbound
                      ? 'Cuando tu universidad registre la nominación y recibas la invitación, el proceso aparecerá aquí.'
                      : 'Cuando elijas una convocatoria, tu proceso aparecerá aquí.'
                  }
                </p>
                <button class="btn btn-primary" onclick="go('calls')">Ver convocatorias</button>
              </div>`
        }
      </section>
      <section class="student-applications-section">
        <div class="student-section-heading">
          <div>
            <span>Procesos anteriores</span>
            <h2>Historial</h2>
          </div>
          <strong>${history.length}</strong>
        </div>
        <div class="student-application-history">
          ${
            history.length
              ? history.map((application) => studentApplicationCard(application)).join('')
              : '<p class="muted">Todavía no tienes postulaciones anteriores.</p>'
          }
        </div>
      </section>`;
}
function studentApplicationDetailView(application) {
  const call = state.calls.find((item) => item.id === application.callId);
  const uploaded = application.documents.filter((document) => document.storagePath).length;
  const documentRows = application.documents.length
    ? application.documents
        .map(
          (document) =>
            html`<article class="student-document-row">
              <div class="doc-icon">${document.storagePath ? 'PDF' : '—'}</div>
              <div class="doc-main">
                <strong>${esc(document.name)}</strong>
                <small
                  >${document.fileName ? esc(document.fileName) : 'Archivo pendiente'} ·
                  ${document.required ? 'Obligatorio' : 'Opcional'}</small
                >
                ${
                  document.reviewerComment
                    ? html`<p class="student-document-comment">
                        <strong>Observación de OCRI:</strong> ${esc(document.reviewerComment)}
                      </p>`
                    : ''
                }
              </div>
              ${badge(document.status)}
            </article>`,
        )
        .join('')
    : '<p class="muted">Esta convocatoria no tiene documentos configurados.</p>';
  $('#view').innerHTML =
    head(
      'Detalle de postulación',
      application.displayId || application.id,
      html`<button
        class="btn btn-soft"
        onclick="go('${session.role === 'external' ? 'sgme' : 'sgms'}')"
      >
        ← Mis postulaciones
      </button>`,
    ) +
    html`<section class="student-application-summary">
        <div>
          <span>Convocatoria</span>
          <h2>${esc(call?.title || application.callTitle)}</h2>
          <p>${esc(call?.period || '')}${call?.end ? ` · Cierre ${shortDate(call.end)}` : ''}</p>
        </div>
        <div class="student-summary-status">
          <span>Estado actual</span>
          ${badge(application.status)}
        </div>
        <div class="student-summary-progress">
          <span>Avance del expediente</span>
          <strong>${application.progress}%</strong>
          <div class="progress"><span style="width:${application.progress}%"></span></div>
        </div>
        ${
          application.status === 'BORRADOR' && session.role === 'student'
            ? html`<button
                class="btn btn-primary"
                onclick="openExistingApplication('${application.id}')"
              >
                Continuar postulación
              </button>`
            : ''
        }
      </section>
      ${acceptanceLetterSection(application)}
      <section class="card student-detail-section">
        <div class="student-detail-heading">
          <div>
            <span>01</span>
            <h2>Documentos</h2>
          </div>
          <strong>${uploaded} de ${application.documents.length} cargados</strong>
        </div>
        <div class="student-document-list">${documentRows}</div>
      </section>
      <section class="card student-detail-section">
        <div class="student-detail-heading">
          <div>
            <span>02</span>
            <h2>Estado y novedades</h2>
          </div>
        </div>
        <div class="timeline">
          ${application.history
            .map(
              (entry) =>
                html`<div class="timeline-item">
                  <div class="timeline-dot"></div>
                  <div>
                    <strong>${esc(entry[0])}</strong>
                    <p>${esc(entry[1])}</p>
                  </div>
                </div>`,
            )
            .join('')}
        </div>
        ${workflowStrip(application)}
      </section>`;
}
function studentDashboard() {
  const applications = getStudentApplications();
  const application = getActiveStudentApplication();
  const call = application
    ? state.calls.find((item) => item.id === application.callId)
    : state.calls.find((item) => item.direction === 'SALIENTE' && item.status === 'ACTIVA');
  const uploaded = application?.documents.filter((document) => document.storagePath).length || 0;
  const totalDocuments = application?.documents.length || 0;
  const nextStep = !application
    ? ''
    : application.status === 'BORRADOR'
      ? 'Completa los datos y documentos pendientes antes de enviar tu postulación.'
      : application.status === 'OBSERVADO'
        ? 'Tienes observaciones pendientes. Revisa el detalle de tus documentos.'
        : 'OCRI está revisando tu expediente. Aquí verás cualquier novedad del proceso.';
  $('#view').innerHTML = html`<div class="dashboard-heading student-welcome">
      <h1>Hola, ${esc(session.name.split(' ')[0])}.</h1>
      <p>Encuentra rápidamente el estado de tu movilidad y tu siguiente acción.</p>
    </div>
    ${
      application
        ? html`<article class="student-active-card">
            <div class="student-active-main">
              <div class="eyebrow">Tu postulación activa</div>
              <div class="student-active-heading">
                <div>
                  <h2>${esc(call?.title || application.callTitle)}</h2>
                  <p>${esc(call?.period || '')} · ${badge(application.status)}</p>
                </div>
                <strong>${application.progress}%</strong>
              </div>
              <div class="progress"><span style="width:${application.progress}%"></span></div>
              <p class="student-document-progress">
                ${uploaded} de ${totalDocuments} documentos cargados
              </p>
            </div>
            <div class="student-next-step">
              <span>Siguiente paso</span>
              <p>${nextStep}</p>
              <div class="student-card-actions">
                <button
                  class="btn btn-primary"
                  onclick="${
                    application.status === 'BORRADOR'
                      ? `openExistingApplication('${application.id}')`
                      : `openStudentApplication('${application.id}')`
                  }"
                >
                  ${application.status === 'BORRADOR' ? 'Continuar postulación' : 'Ver detalle'}
                </button>
                <button class="btn btn-soft" onclick="go('sgms')">Mis postulaciones</button>
              </div>
            </div>
          </article>`
        : html`<article class="student-empty-journey">
            <div>
              <div class="eyebrow">Tu movilidad</div>
              <h2>No tienes una postulación activa</h2>
              <p>Explora las convocatorias disponibles y elige la oportunidad adecuada para ti.</p>
            </div>
            <button class="btn btn-primary" onclick="go('calls')">Ver convocatorias</button>
          </article>`
    }
    <div class="student-home-secondary">
      <article class="card student-opportunity-summary">
        <span>${call ? 'Convocatoria disponible' : 'Convocatorias'}</span>
        <h3>${esc(call?.title || 'Próximamente publicaremos nuevas oportunidades')}</h3>
        <button class="text-action" onclick="go('calls')">Explorar convocatorias →</button>
      </article>
      <article class="card student-history-summary">
        <span>Historial personal</span>
        <strong>${applications.length}</strong>
        <p>${applications.length === 1 ? 'postulación registrada' : 'postulaciones registradas'}</p>
        <button class="text-action" onclick="go('sgms')">Ver mis postulaciones →</button>
      </article>
    </div>`;
}
function workflowSteps(direction) {
  if (direction === 'ENTRANTE')
    return [
      ['NOMINADO_ORIGEN', 'Nominado por universidad de origen'],
      ['EN_EDICION', 'En edición por estudiante'],
      ['POSTULADO', 'Postulado'],
      ['VALIDADO_ORIGEN', 'Validado por universidad de origen'],
      ['EN_REVISION_OCRI', 'En revisión OCRI y unidad académica'],
      ['ACEPTADO', 'Aceptado por UNSAAC'],
      ['EN_MOVILIDAD', 'En movilidad'],
      ['CONCLUIDO', 'Concluido'],
    ];
  return [
    ['BORRADOR', 'Borrador'],
    ['POSTULADO', 'Postulado'],
    ['EN_REVISION_OCRI', 'En revisión OCRI'],
    ['NOMINADO_UNSAAC', 'Nominado por UNSAAC'],
    ['EN_EVALUACION_DESTINO', 'En evaluación por universidad destino'],
    ['ACEPTADO', 'Aceptado por universidad destino'],
    ['EN_MOVILIDAD', 'En movilidad'],
    ['CONCLUIDO', 'Concluido'],
  ];
}
function workflowPosition(application) {
  const status = application?.status || '';
  const aliases = {
    ENVIADA: 'POSTULADO',
    OBSERVADA: 'EN_REVISION_OCRI',
    APROBADA_OCRI: 'EN_REVISION_OCRI',
    FINALIZADA: 'CONCLUIDO',
    EN_REVISION_DOCUMENTAL: 'EN_REVISION_OCRI',
    APROBADO_OCRI: 'EN_REVISION_OCRI',
    OBSERVADO: 'EN_REVISION_OCRI',
    BORRADOR: application?.direction === 'ENTRANTE' ? 'EN_EDICION' : 'BORRADOR',
    NOMINADO: application?.direction === 'ENTRANTE' ? 'NOMINADO_ORIGEN' : 'NOMINADO_UNSAAC',
    FINALIZADO: 'CONCLUIDO',
  };
  const normalized = aliases[status] || status;
  return workflowSteps(application?.direction).findIndex(([key]) => key === normalized);
}
function workflowStrip(application) {
  const steps = workflowSteps(application.direction);
  const current = workflowPosition(application);
  return html`<ol class="role-workflow" aria-label="Flujo de la postulación">
    ${steps
      .map(
        ([, label], index) =>
          html`<li
            class="${index < current ? 'is-done' : ''} ${index === current ? 'is-current' : ''}"
          >
            <span>${String(index + 1).padStart(2, '0')}</span>
            <strong>${label}</strong>
          </li>`,
      )
      .join('')}
  </ol>`;
}
function externalStudentDashboard() {
  const applications = getMobilityApplications('ENTRANTE');
  const application = applications.find((item) => !isClosedApplication(item)) || null;
  const university = session.university || 'tu universidad de origen';
  const latestCall = state.calls.find(
    (item) => item.direction === 'ENTRANTE' && item.status === 'ACTIVA',
  );
  $('#view').innerHTML = html`<div class="dashboard-heading student-welcome external-heading">
      <div class="eyebrow">Movilidad entrante · SGME</div>
      <h1>Hola, ${esc(session.name.split(' ')[0])}.</h1>
      <p>Tu expediente comienza cuando ${esc(university)} registra tu nominación.</p>
    </div>
    ${
      application
        ? html`<article class="student-active-card inbound-active-card">
              <div class="student-active-main">
                <div class="eyebrow">Tu postulación activa</div>
                <div class="student-active-heading">
                  <div>
                    <h2>${esc(application.callTitle)}</h2>
                    <p>${badge(application.status)}</p>
                  </div>
                  <strong>${application.progress}%</strong>
                </div>
                <div class="progress"><span style="width:${application.progress}%"></span></div>
              </div>
              <div class="student-next-step">
                <span>Siguiente paso</span>
                <p>
                  Completa los datos y documentos solicitados. Tu universidad validará el expediente
                  antes de enviarlo a la UNSAAC.
                </p>
                <button
                  class="btn btn-primary"
                  onclick="openStudentApplication('${application.id}')"
                >
                  Ver mi postulación
                </button>
              </div>
            </article>
            <section class="card workflow-card">
              <div class="section-title">
                <h3>Tu ruta de ingreso</h3>
                ${badge(application.status)}
              </div>
              ${workflowStrip(application)}
            </section>`
        : html`<article class="student-empty-journey nomination-gate">
            <div>
              <div class="eyebrow">Paso previo obligatorio</div>
              <h2>Aún no recibimos tu nominación</h2>
              <p>
                No necesitas iniciar una postulación por tu cuenta. La oficina de movilidad de tu
                universidad debe nominarte y SIGMA te enviará la invitación.
              </p>
            </div>
            <button class="btn btn-soft" onclick="go('calls')">Consultar convocatorias</button>
          </article>`
    }
    <div class="student-home-secondary">
      <article class="card student-opportunity-summary">
        <span>Convocatoria entrante</span>
        <h3>${esc(latestCall?.title || 'No hay una convocatoria entrante activa')}</h3>
        <button class="text-action" onclick="go('calls')">Ver información →</button>
      </article>
      <article class="card student-history-summary">
        <span>Historial personal</span>
        <strong>${applications.length}</strong>
        <p>${applications.length === 1 ? 'postulación registrada' : 'postulaciones registradas'}</p>
        <button class="text-action" onclick="go('sgme')">Ver mis postulaciones →</button>
      </article>
    </div>`;
}
function managerDashboard() {
  return managerOverview();
}
function operationalMetric(value, label, target) {
  return html`<button class="operational-metric" onclick="go('${target}')">
    <strong>${value}</strong><span>${label}</span><small>Consultar →</small>
  </button>`;
}
function adminDashboard(apps) {
  const active = apps.filter((a) => !isClosedApplication(a) && a.status !== 'BORRADOR');
  const closing = state.calls.filter((c) => {
    const days = (new Date(`${c.end}T23:59:59`) - new Date()) / 86400000;
    return c.status === 'ACTIVA' && days >= 0 && days <= 14;
  });
  $('#view').innerHTML =
    head(
      'Panel general',
      'Prioridades y seguimiento de la movilidad académica.',
      '<button class="btn btn-primary" onclick="callModal()">+ Nueva convocatoria</button>',
    ) +
    html`<div class="operational-metrics">
        ${operationalMetric(active.filter((a) => /POSTULAD|REVISION|VALIDACION/.test(a.status)).length, 'Expedientes por revisar', 'applications')}
        ${operationalMetric(active.filter((a) => a.status === 'OBSERVADO').length, 'Subsanaciones pendientes', 'applications')}
        ${operationalMetric(active.filter((a) => a.direction === 'SALIENTE' && a.status === 'APROBADO_OCRI').length, 'Pendientes de nominación', 'applications')}
        ${operationalMetric(active.filter((a) => a.direction === 'SALIENTE' && /NOMINAD|EVALUACION_DESTINO/.test(a.status)).length, 'Esperan decisión de destino', 'applications')}
        ${operationalMetric(active.filter((a) => a.status === 'EN_MOVILIDAD').length, 'Movilidades en curso', 'applications')}
        ${operationalMetric(closing.length, 'Convocatorias por cerrar · 14 días', 'calls')}
      </div>
      <div class="role-flow-grid">
        <article class="card role-flow-card">
          <span class="eyebrow">SGMS · Saliente</span>
          <h2>De la UNSAAC al mundo</h2>
          <p>OCRI revisa y nomina. La universidad de destino decide la aceptación.</p>
          <button class="btn btn-soft" onclick="openOperationalQueue('SALIENTE')">
            ${active.filter((a) => a.direction === 'SALIENTE').length} expedientes activos →
          </button>
        </article>
        <article class="card role-flow-card inbound">
          <span class="eyebrow">SGME · Entrante</span>
          <h2>Del mundo a la UNSAAC</h2>
          <p>
            La universidad de origen nomina y valida. OCRI coordina la evaluación académica en la
            UNSAAC.
          </p>
          <button class="btn btn-soft" onclick="openOperationalQueue('ENTRANTE')">
            ${active.filter((a) => a.direction === 'ENTRANTE').length} expedientes activos →
          </button>
        </article>
      </div>
      <section class="card operational-section">
        <div class="section-title">
          <h3>Expedientes recientes</h3>
          <button class="text-action" onclick="go('applications')">Ver todos →</button>
        </div>
        ${operationalTable(active.slice(0, 6))}
      </section>`;
}
let operationalDirection = '';
function openOperationalQueue(direction) {
  operationalDirection = direction;
  go('applications');
}
function operationalTable(apps) {
  if (!apps.length)
    return '<div class="empty">No hay expedientes que coincidan con esta selección.</div>';
  return html`<div class="table-wrap">
    <table class="table">
      <thead>
        <tr>
          <th>Estudiante / expediente</th>
          <th>Flujo y convocatoria</th>
          <th>Estado</th>
          <th>Fecha de registro o envío</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${apps
          .map(
            (a) =>
              html`<tr>
                <td>
                  <strong>${esc(a.student)}</strong><br /><small>${esc(a.displayId || a.id)}</small>
                </td>
                <td>
                  <span class="badge neutral"
                    >${a.direction === 'SALIENTE' ? 'SGMS · Saliente' : 'SGME · Entrante'}</span
                  >
                  <p>${esc(a.callTitle)}</p>
                </td>
                <td>${badge(a.status)}</td>
                <td>${esc(a.submitted)}</td>
                <td>
                  <button class="btn btn-soft btn-sm" onclick="detailModal('${a.id}')">
                    Ver expediente
                  </button>
                </td>
              </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>`;
}
function adminApplicationsView() {
  const apps = state.applications.filter((a) => a.status !== 'BORRADOR');
  const options = (values) =>
    [...new Set(values.filter(Boolean))]
      .map((v) => `<option value="${esc(v)}">${esc(STATUS_LABELS[v] || v)}</option>`)
      .join('');
  $('#view').innerHTML =
    head('Expedientes', 'Consulta cada proceso, sus documentos y su estado actual.') +
    html` <section class="card operational-section">
      <form
        id="queueFilters"
        class="queue-filters"
        onsubmit="event.preventDefault()"
        oninput="filterOperationalQueue()"
      >
        <label
          >Buscar<input class="input" name="search" placeholder="Estudiante o convocatoria"
        /></label>
        <label
          >Flujo<select class="input" name="direction">
            <option value="">Todos los flujos</option>
            <option value="SALIENTE" ${operationalDirection === 'SALIENTE' ? 'selected' : ''}>
              SGMS · Saliente
            </option>
            <option value="ENTRANTE" ${operationalDirection === 'ENTRANTE' ? 'selected' : ''}>
              SGME · Entrante
            </option>
          </select></label
        >
        <label
          >Estado<select class="input" name="status">
            <option value="">Todos los estados</option>
            ${options(apps.map((a) => a.status))}
          </select></label
        >
        <label
          >Periodo<select class="input" name="period">
            <option value="">Todos los periodos</option>
            ${options(state.calls.map((c) => c.period))}
          </select></label
        >
        <label
          >Carta<select class="input" name="letter">
            <option value="">Todas las cartas</option>
            <option value="waiting">Esperando carta</option>
            <option value="review">Carta por revisar</option>
          </select></label
        >
        <label
          >Facultad<select class="input" name="faculty">
            <option value="">Todas las facultades</option>
            ${options(apps.map((a) => a.faculty))}
          </select></label
        >
      </form>
      <p id="queueCount" class="muted" aria-live="polite"></p>
      <div id="queueRows"></div>
    </section>`;
  filterOperationalQueue();
}
function filterOperationalQueue() {
  const form = $('#queueFilters');
  if (!form || session.role !== 'admin') return;
  const filters = Object.fromEntries(new FormData(form));
  const apps = state.applications.filter((a) => {
    const call = state.calls.find((c) => c.id === a.callId);
    return (
      a.status !== 'BORRADOR' &&
      (!filters.direction || filters.direction === a.direction) &&
      (!filters.status || filters.status === a.status) &&
      (!filters.period || filters.period === call?.period) &&
      (!filters.faculty || filters.faculty === a.faculty) &&
      (!filters.letter ||
        (filters.letter === 'review'
          ? a.letter?.status === 'PENDIENTE'
          : !a.letter && ['NOMINADO_UNSAAC', 'EN_EVALUACION_DESTINO'].includes(a.status))) &&
      `${a.student} ${a.callTitle} ${a.displayId}`
        .toLowerCase()
        .includes(filters.search.trim().toLowerCase())
    );
  });
  $('#queueCount').textContent = `${apps.length} expedientes`;
  $('#queueRows').innerHTML = operationalTable(apps);
}
function plannedArea(title, description, steps) {
  return (
    head(title, description) +
    html`<section class="card operational-section">
      <span class="badge warn">Próxima etapa</span>
      <h2>Así funcionará este apartado</h2>
      <ol class="planned-steps">
        ${steps.map((s) => `<li>${esc(s)}</li>`).join('')}
      </ol>
      <p class="muted">El registro de estas operaciones todavía no está habilitado.</p>
    </section>`
  );
}
function academicReviewView() {
  $('#view').innerHTML = plannedArea(
    'Evaluación académica',
    'Opiniones de las unidades académicas para movilidad entrante.',
    [
      'OCRI deriva el expediente validado a la unidad académica correspondiente.',
      'Se registra el dictamen y sus observaciones.',
      'OCRI comunica la decisión de admisión al estudiante y a su universidad.',
    ],
  );
}
function lettersView() {
  $('#view').innerHTML = plannedArea(
    'Cartas',
    'Documentos institucionales asociados a cada expediente.',
    [
      'SGMS: registrar la carta de aceptación emitida por la universidad de destino.',
      'SGME: emitir o adjuntar la carta de aceptación de la UNSAAC tras la evaluación.',
      'Consultar la carta desde el detalle de la postulación correspondiente.',
    ],
  );
}
function auditView() {
  $('#view').innerHTML = plannedArea(
    'Auditoría',
    'Trazabilidad institucional de cambios y decisiones.',
    [
      'Consultar quién realizó una operación y cuándo.',
      'Revisar cambios de estado, documentos y decisiones por expediente.',
      'Distinguir las notas internas de las comunicaciones visibles para el estudiante.',
    ],
  );
}
function managerNominations() {
  return session.university
    ? state.nominations.filter((n) => n.university === session.university)
    : [];
}
function managerOverview() {
  const nominations = managerNominations();
  $('#view').innerHTML =
    head('Resumen de movilidad entrante', esc(session.university || 'Universidad asociada')) +
    html` <div class="operational-metrics">
        ${operationalMetric(nominations.length, 'Nominaciones registradas', 'nominations')}
        ${operationalMetric(nominations.filter((n) => /EDICION|BORRADOR|INVITACION/.test(n.status)).length, 'Pendientes del estudiante', 'manager_students')}
        ${operationalMetric(nominations.filter((n) => n.status === 'POSTULADO').length, 'Por validar en origen', 'manager_students')}
        ${operationalMetric(nominations.filter((n) => /ACEPTAD|NO_ADMITID|CONCLUID/.test(n.status)).length, 'Resultados registrados', 'manager_results')}
      </div>
      <section class="card role-flow-card">
        <span class="eyebrow">Universidad de origen → UNSAAC</span>
        <h2>Acompaña cada nominación</h2>
        <p>Nominar → estudiante completa → universidad valida → UNSAAC evalúa → resultado.</p>
        <button class="btn btn-primary" onclick="go('nominations')">Gestionar nominaciones</button>
        <button class="btn btn-soft" onclick="go('calls')">Consultar convocatorias</button>
      </section>
      <section class="card operational-section">
        <h3>Últimas nominaciones</h3>
        ${nominations.length ? nomTable(nominations.slice(0, 5)) : '<div class="empty">Aún no hay nominaciones registradas para tu universidad.</div>'}
      </section>`;
}
function managerStudentsView() {
  const nominations = managerNominations();
  $('#view').innerHTML =
    head(
      'Estudiantes',
      'Personas nominadas por ' + esc(session.university || 'tu universidad') + '.',
    ) +
    html`<section class="card operational-section">
      ${nominations.length ? nomTable(nominations) : '<div class="empty">Los estudiantes aparecerán cuando se registre su nominación.</div>'}
    </section>`;
}
function managerResultsView() {
  const results = managerNominations().filter((n) =>
    /ACEPTAD|NO_ADMITID|RECHAZAD|CONCLUID|FINALIZAD|CANCELAD/.test(n.status),
  );
  $('#view').innerHTML =
    head(
      'Resultados',
      'Decisiones registradas por la UNSAAC sobre las nominaciones de tu universidad.',
    ) +
    html`<section class="card operational-section">
      ${results.length ? nomTable(results) : '<div class="empty">Todavía no hay resultados de admisión registrados.</div>'}
    </section>`;
}
function trackingView() {
  const application = filteredApps(session.role === 'student' ? 'SALIENTE' : 'ENTRANTE')[0];
  $('#view').innerHTML = application
    ? head('Seguimiento de postulación', 'Revisa el avance y los documentos de tu expediente.') +
      applicationDetail(application)
    : head('Seguimiento', 'Aún no hay una postulación registrada.') +
      '<div class="empty">Cuando inicies una postulación, su seguimiento aparecerá aquí.</div>';
}
function profileView() {
  if (pendingProfilePhotoPreview) {
    URL.revokeObjectURL(pendingProfilePhotoPreview);
    pendingProfilePhotoPreview = '';
  }
  const title = session.role === 'external_manager' ? 'Perfil institucional' : 'Mi perfil';
  const description =
    session.role === 'external_manager'
      ? 'Datos de contacto de la universidad y de la persona responsable.'
      : 'Actualiza tus datos personales.';
  const hasStoredPhoto = Boolean(session.photoPath);
  const photo = session.photoUrl
    ? html`<img src="${esc(session.photoUrl)}" alt="Foto de perfil de ${esc(session.name)}" />`
    : esc(session.initials);
  const photoActions = hasStoredPhoto
    ? html`<div class="profile-avatar-actions">
        <button type="button" onclick="viewProfilePhoto()">Ver foto</button>
        <button type="button" onclick="selectProfilePhoto()">Actualizar</button>
      </div>`
    : html`<button
        type="button"
        class="profile-avatar-required"
        onclick="selectProfilePhoto()"
        aria-label="Agregar foto de perfil obligatoria"
      >
        <span>Agregar foto</span>
        <small>Obligatoria</small>
      </button>`;
  $('#view').innerHTML =
    head(title, description) +
    html`<article class="card profile-card profile-editor">
      <div class="profile-photo-column">
        <div
          class="profile-avatar-control ${hasStoredPhoto ? 'has-photo' : 'is-required'}"
          id="profile-avatar-control"
        >
          <div class="profile-avatar" id="profile-avatar-media">${photo}</div>
          <div id="profile-avatar-actions">${photoActions}</div>
        </div>
        <input
          class="visually-hidden"
          id="profile-photo-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onchange="previewProfilePhoto(event)"
        />
        <strong>${esc(session.name)}</strong>
        <small>${esc(session.label)}</small>
        <div class="profile-photo-notice" id="profile-photo-notice">
          <strong>Foto oficial</strong>
          <span
            >Utiliza una fotografía tipo carnet con fondo blanco. Será empleada en tus trámites de
            movilidad.</span
          >
        </div>
      </div>
      <form class="form-grid profile-form" id="profile-form" onsubmit="saveProfile(event)">
        <div class="field">
          <label>Nombre completo</label
          ><input class="input" name="fullName" value="${esc(session.name)}" required />
        </div>
        <div class="field">
          <label>Correo institucional</label
          ><input class="input" value="${esc(session.email)}" readonly aria-readonly="true" />
        </div>
        <div class="field">
          <label>Teléfono <span class="muted">(opcional)</span></label
          ><input
            class="input"
            name="phone"
            value="${esc(session.phone)}"
            placeholder="Ej. +51 999 999 999"
          />
        </div>
        <div class="field">
          <label>Dirección <span class="muted">(opcional)</span></label
          ><input
            class="input"
            name="address"
            value="${esc(session.address)}"
            placeholder="Ciudad, distrito o referencia"
          />
        </div>
        <div class="field wide">
          <label>Universidad</label
          ><input
            class="input"
            value="${esc(session.university || 'Universidad pendiente de confirmar')}"
            readonly
            aria-readonly="true"
          />
        </div>
        <div class="modal-actions wide">
          <button class="btn btn-primary">Guardar perfil</button>
        </div>
      </form>
    </article>`;
}
function selectProfilePhoto() {
  $('#profile-photo-input')?.click();
}
async function previewProfilePhoto(event) {
  const [photo] = event.target.files || [];
  if (!photo) return;

  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(photo.type)) {
    event.target.value = '';
    return toast('La foto debe ser JPG, PNG o WEBP.');
  }
  if (photo.size > 5 * 1024 * 1024) {
    event.target.value = '';
    return toast('La foto no puede superar los 5 MB.');
  }

  if (pendingProfilePhotoPreview) URL.revokeObjectURL(pendingProfilePhotoPreview);
  pendingProfilePhotoPreview = URL.createObjectURL(photo);
  $('#profile-avatar-media').innerHTML = html`<img
    src="${esc(pendingProfilePhotoPreview)}"
    alt="Vista previa de la nueva foto de perfil"
  />`;
  $('#profile-avatar-control').className = 'profile-avatar-control has-photo';
  $('#profile-avatar-actions').innerHTML = html`<div class="profile-avatar-actions">
    <button type="button" onclick="viewProfilePhoto()">Ver foto</button>
    <button type="button" onclick="selectProfilePhoto()">Cambiar</button>
  </div>`;
  const notice = $('#profile-photo-notice');
  notice.querySelector('strong').textContent = 'Subiendo foto…';
  notice.querySelector('span').textContent = 'Espera un momento mientras se actualiza tu perfil.';

  const extension = photo.type === 'image/jpeg' ? 'jpg' : photo.type.split('/')[1];
  const photoPath = `${session.userId}/foto-perfil.${extension}`;
  const previousPhotoPath = session.photoPath;
  const { error: uploadError } = await supabase.storage
    .from('profile-photos')
    .upload(photoPath, photo, { upsert: true, contentType: photo.type });
  if (uploadError) {
    profileView();
    return toast(`No se pudo subir la foto: ${uploadError.message}`);
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ photo_path: photoPath, updated_at: new Date().toISOString() })
    .eq('user_id', session.userId);
  if (profileError && previousPhotoPath !== photoPath) {
    await supabase.storage.from('profile-photos').remove([photoPath]);
    profileView();
    return toast(`No se pudo registrar la foto: ${profileError.message}`);
  }
  if (previousPhotoPath && previousPhotoPath !== photoPath)
    await supabase.storage.from('profile-photos').remove([previousPhotoPath]);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await loadSession(user);
  toast('Foto de perfil actualizada.');
}
function viewProfilePhoto() {
  const photoUrl = pendingProfilePhotoPreview || session.photoUrl;
  if (!photoUrl)
    return toast('No se pudo abrir la foto guardada. Recarga la página e inténtalo otra vez.');

  modal(
    html`<div class="modal-head">
        <h2>Foto de perfil</h2>
        <button class="modal-close" onclick="closeModal()" aria-label="Cerrar">×</button>
      </div>
      <div class="profile-photo-preview">
        <img src="${esc(photoUrl)}" alt="Foto de perfil de ${esc(session.name)}" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-soft" type="button" onclick="closeModal()">Cerrar</button>
        <button class="btn btn-primary" type="button" onclick="updateProfilePhotoFromPreview()">
          Actualizar foto
        </button>
      </div>`,
    'profile-photo-dialog',
  );
}
function updateProfilePhotoFromPreview() {
  closeModal();
  selectProfilePhoto();
}
async function saveProfile(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const profileUpdate = {
    full_name: form.get('fullName').trim(),
    phone: form.get('phone').trim() || null,
    address: form.get('address').trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('profiles')
    .update(profileUpdate)
    .eq('user_id', session.userId);
  if (error) return toast(`No se pudo guardar el perfil: ${error.message}`);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await loadSession(user);
  toast('Perfil actualizado.');
}

// -----------------------------------------------------------------------------
// Componentes de interfaz reutilizables
// -----------------------------------------------------------------------------
function appTable(apps) {
  return html`<div class="table-wrap">
    <table class="table">
      <thead>
        <tr>
          <th>Expediente</th>
          <th>Estudiante</th>
          <th>Facultad</th>
          <th>Universidad</th>
          <th>Estado</th>
          <th>Avance</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${apps
          .map(
            (a) =>
              html`<tr>
                <td>
                  <strong>${a.displayId || a.id}</strong><br /><small class="muted"
                    >${a.submitted}</small
                  >
                </td>
                <td>${esc(a.student)}<br /><small class="muted">${a.code}</small></td>
                <td>${esc(a.faculty)}</td>
                <td>${esc(a.destination)}</td>
                <td>${badge(a.status)}</td>
                <td>
                  <div class="progress" style="width:75px">
                    <span style="width:${a.progress}%"></span>
                  </div>
                </td>
                <td>
                  <button class="btn btn-sm btn-soft" onclick="detailModal('${a.id}')">Ver</button>
                </td>
              </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>`;
}
function applicationDetail(a) {
  return html`<div class="grid-2">
    <div class="card">
      <h3>Documentos del expediente</h3>
      <div class="doc-list">
        ${a.documents
          .map(
            (d) =>
              html`<div class="doc-item">
                <div class="doc-icon">PDF</div>
                <div class="doc-main">
                  <strong>${esc(d.name)}</strong><small>Documento requerido</small>
                </div>
                ${badge(d.status)}
              </div>`,
          )
          .join('')}
      </div>
    </div>
    <div class="card">
      <h3>Seguimiento</h3>
      <div class="timeline">
        ${a.history
          .map(
            (h) =>
              html`<div class="timeline-item">
                <div class="timeline-dot"></div>
                <div>
                  <strong>${esc(h[0])}</strong>
                  <p>${h[1]}</p>
                </div>
              </div>`,
          )
          .join('')}
      </div>
    </div>
  </div>`;
}
function callCard(c) {
  const cover = c.coverImage ? ` style="background-image:url('${esc(c.coverImage)}')"` : '';
  const titleSize = c.title.length > 58 ? 'is-extra-long' : c.title.length > 28 ? 'is-long' : '';
  return html`<article
    class="call-card"
    data-direction="${c.direction}"
    role="button"
    tabindex="0"
    aria-label="Abrir convocatoria ${esc(c.title)}"
    onclick="showCallSummary('${c.id}')"
    onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();showCallSummary('${c.id}')}"
  >
    <div class="call-cover${c.coverImage ? ' has-image' : ''}" ${cover}>
      <div class="call-flags">
        ${badge(c.status)}<span class="badge neutral">${c.direction}</span>
      </div>
      <span class="call-open-hint">Abrir convocatoria ↗</span>
    </div>
    <div class="call-body">
      <div class="call-title-row"><h3 class="${titleSize}">${esc(c.title)}</h3></div>
      <div class="call-meta-line">
        <strong>${esc(c.period)}</strong><span></span><b>Límite: ${shortDate(c.end)}</b>
      </div>
    </div>
  </article>`;
}
function nomTable(nominations = state.nominations) {
  return html`<div class="table-wrap">
    <table class="table">
      <thead>
        <tr>
          <th>Código</th>
          <th>Estudiante</th>
          <th>Universidad</th>
          <th>País</th>
          <th>Contacto</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        ${nominations
          .map(
            (n) =>
              html`<tr>
                <td><strong>${n.id}</strong></td>
                <td>${esc(n.student)}</td>
                <td>${esc(n.university)}</td>
                <td>${esc(n.country)}</td>
                <td>${esc(n.email)}</td>
                <td>${badge(n.status)}</td>
              </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>`;
}
function modal(body, variant = '') {
  document.body.insertAdjacentHTML(
    'beforeend',
    html`<div class="modal-backdrop ${variant ? `backdrop-${variant}` : ''}" id="modal">
      <div class="modal ${variant}">${body}</div>
    </div>`,
  );
}
function closeModal() {
  $('#modal')?.remove();
}

// -----------------------------------------------------------------------------
// Convocatorias: asistente de creación, edición y publicación local
// -----------------------------------------------------------------------------
function callModal() {
  editingCallId = null;
  callWizardStep = 1;
  callDraft = {
    title: '',
    direction: 'SALIENTE',
    period: nextAcademicPeriod(),
    end: '',
    coverImage: '',
    coverName: '',
    guidelinesText: '',
    guidelines: [],
    documents: [],
    resources: [],
    notice: { links: [] },
  };
  renderCallWizard();
}
function editCall(id) {
  const source = state.calls.find((call) => call.id === id);
  if (!source || session?.role !== 'admin') return;
  editingCallId = id;
  callWizardStep = 1;
  callDraft = structuredClone(source);
  callDraft.guidelines = callDraft.guidelines || [];
  callDraft.guidelinesText =
    callDraft.guidelinesText || callDraft.guidelines.map((item) => `• ${item}`).join('\n');
  callDraft.documents = callDraft.documents || [];
  callDraft.resources = callDraft.resources || [];
  callDraft.notice = { links: noticeLinks(callDraft.notice) };
  renderCallWizard();
}
function nextAcademicPeriod() {
  const year = new Date().getFullYear();
  return `${year + 1}-I`;
}
function periodOptions(selected) {
  const first = new Date().getFullYear(),
    options = [];
  for (let year = first; year <= first + 5; year += 1) {
    options.push(`${year}-I`, `${year}-II`);
  }
  return options
    .map(
      (period) =>
        html`<option value="${period}" ${period === selected ? 'selected' : ''}>${period}</option>`,
    )
    .join('');
}
function syncCallDraft() {
  const form = $('#callWizardForm');
  if (!form || !callDraft) return;
  const data = new FormData(form),
    has = (name) => Boolean(form.elements.namedItem(name)),
    text = (name, fallback = '') => (has(name) ? String(data.get(name) || '').trim() : fallback);
  if (has('title')) {
    callDraft.title = text('title', callDraft.title);
    callDraft.direction = text('direction', callDraft.direction);
    callDraft.period = text('period', callDraft.period);
    callDraft.end = text('end', callDraft.end);
  }
  if (has('guidelines_text')) {
    callDraft.guidelinesText = text('guidelines_text', callDraft.guidelinesText);
    callDraft.guidelines = callDraft.guidelinesText
      .split(/\r?\n/)
      .map((item) => item.trim().replace(/^[•*–-]\s*/, ''))
      .filter(Boolean);
  }
  if (has('document_title_0'))
    callDraft.documents = callDraft.documents.map((item, index) => ({
      title: text(`document_title_${index}`, item.title),
      description: text(`document_description_${index}`, item.description),
      required: has(`document_required_${index}`)
        ? data.get(`document_required_${index}`) === 'on'
        : item.required,
    }));
  if (has('resource_file_0'))
    callDraft.resources = callDraft.resources.map((item, index) => {
      const file = data.get(`resource_file_${index}`);
      return {
        ...item,
        description: text(`resource_description_${index}`, item.description),
        fileName: file instanceof File && file.name ? file.name : item.fileName,
      };
    });
  if (has('notice_link_label_0'))
    callDraft.notice = {
      links: (callDraft.notice.links || []).map((item, index) => ({
        label: text(`notice_link_label_${index}`, item.label),
        url: text(`notice_link_url_${index}`, item.url),
      })),
    };
}
function wizardNavigation() {
  const labels = ['Información', 'Requisitos', 'Documentos', 'Material OCRI', 'Revisión'];
  return html`<aside class="wizard-route">
    <div class="eyebrow">Ruta de publicación</div>
    <h3>Nueva convocatoria</h3>
    ${labels.map((label, index) => html`<button type="button" class="${callWizardStep === index + 1 ? 'active' : ''} ${callWizardStep > index + 1 ? 'done' : ''}" onclick="goCallWizardStep(${index + 1})"><span>0${index + 1}</span>${label}</button>`).join('')}
    <p>La convocatoria representa una universidad o convenio específico.</p>
  </aside>`;
}
function renderCallWizard() {
  const content = [
    wizardInformation,
    wizardGuidelines,
    wizardDocuments,
    wizardMaterials,
    wizardReview,
  ][callWizardStep - 1]();
  const titles = [
    '01 · Información general',
    '02 · Requisitos generales',
    '03 · Documentos a presentar',
    '04 · Material OCRI e información importante',
    '05 · Revisión y publicación',
  ];
  const flowLabel = editingCallId ? 'Editar convocatoria' : 'Nueva convocatoria';
  const body = html`<div class="wizard-shell">
    <header class="wizard-header">
      <div class="wizard-header-start">
        <strong>SIGMA</strong>
        <span>OFICINA DE COOPERACIÓN Y RELACIONES INTERNACIONALES</span>
      </div>
      <div class="wizard-header-end">
        <span>${callDraft.period} · ${flowLabel}</span>
        <i aria-label="Escudo UNSAAC"></i>
      </div>
    </header>
    <div class="wizard-layout">
      ${wizardNavigation()}
      <section class="wizard-main">
        <div class="modal-head">
          <div>
            <div class="eyebrow">Convocatorias / ${flowLabel}</div>
            <h2>${titles[callWizardStep - 1]}</h2>
          </div>
          <button class="wizard-exit" onclick="closeModal()">← Volver a convocatorias</button>
        </div>
        <form id="callWizardForm" onsubmit="return false">${content}</form>
      </section>
    </div>
  </div>`;
  const existing = $('#modal .modal');
  if (existing) {
    // El resumen abre como modal pequeño; al editar se transforma en el asistente completo.
    existing.className = 'modal modal-wizard';
    existing.innerHTML = body;
  } else modal(body, 'modal-wizard');
}
function wizardInformation() {
  return html`<p class="wizard-intro">
      El nombre identifica la universidad o convenio. Elige el periodo al costado para mantener el
      título claro y uniforme.
    </p>
    <div class="form-grid">
      <div class="field">
        <label>Nombre de la convocatoria</label
        ><input
          class="input"
          name="title"
          value="${esc(callDraft.title)}"
          placeholder="Intercambio académico · PUCP"
          required
        />
      </div>
      <div class="field">
        <label>Periodo académico</label
        ><select class="input" name="period">
          ${periodOptions(callDraft.period)}
        </select>
      </div>
      <div class="field">
        <label>Flujo de movilidad</label
        ><select class="input" name="direction" onchange="changeCallDirection(this.value)">
          <option value="SALIENTE" ${callDraft.direction === 'SALIENTE' ? 'selected' : ''}>
            SGMS · Saliente desde UNSAAC
          </option>
          <option value="ENTRANTE" ${callDraft.direction === 'ENTRANTE' ? 'selected' : ''}>
            SGME · Entrante hacia UNSAAC
          </option>
        </select>
      </div>
      <div class="field">
        <label>Imagen de portada <span class="muted">(opcional)</span></label
        ><input
          class="input"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onchange="selectCallCover(this)"
        /><small class="field-help"
          >${callDraft.coverName ? `Seleccionada: ${esc(callDraft.coverName)}` : 'PNG, JPG o WEBP'}</small
        >
      </div>
      <div class="field wide">
        <label>Fecha límite de postulación</label
        ><input class="input" type="date" name="end" value="${esc(callDraft.end)}" required />
      </div>
    </div>
    ${wizardActions('Continuar a requisitos', 'goCallWizardStep(2)')}`;
}
function wizardGuidelines() {
  return html`<p class="wizard-intro">
      Pega directamente las viñetas del brochure. Cada línea se convertirá en un requisito; puedes
      usar •, -, * o escribir una línea por requisito.
    </p>
    <div class="field">
      <label>Requisitos generales</label
      ><textarea
        class="input guidelines-text"
        name="guidelines_text"
        placeholder="• Ser estudiante regular de la UNSAAC&#10;• Encontrarse entre el 5to y 8vo semestre&#10;• No haber realizado una movilidad incompatible"
        required
      >
${esc(callDraft.guidelinesText || callDraft.guidelines.map((item) => `• ${item}`).join('\n'))}</textarea
      ><small class="field-help"
        >Al avanzar se separarán automáticamente en viñetas individuales para la publicación.</small
      >
    </div>
    ${wizardActions('Continuar a documentos', 'goCallWizardStep(3)', 'Volver', 'goCallWizardStep(1)')}`;
}
function wizardDocuments() {
  return html`<p class="wizard-intro">
      Define los archivos que el estudiante deberá presentar. Puedes empezar vacío y añadir solo los
      que corresponden a esta universidad.
    </p>
    <p class="field-help">
      Sugerencias frecuentes: récord académico, carta de motivación, constancia de matrícula,
      pasaporte o carta de nominación.
    </p>
    <div class="wizard-list">
      ${
        callDraft.documents
          .map(
            (item, index) =>
              html`<article class="wizard-entry">
                <div class="entry-number">${String(index + 1).padStart(2, '0')}</div>
                <div class="entry-fields requirement-fields">
                  <div class="field">
                    <label>Documento a presentar</label
                    ><input
                      class="input"
                      name="document_title_${index}"
                      value="${esc(item.title)}"
                      placeholder="Ej. Récord académico"
                      required
                    />
                  </div>
                  <div class="field">
                    <label>Condición</label
                    ><label class="check-label"
                      ><input
                        type="checkbox"
                        name="document_required_${index}"
                        ${item.required ? 'checked' : ''}
                      />
                      Obligatorio</label
                    >
                  </div>
                  <div class="field wide">
                    <label>Indicaciones <span class="muted">(opcional)</span></label
                    ><input
                      class="input"
                      name="document_description_${index}"
                      value="${esc(item.description)}"
                      placeholder="Formato, firma, vigencia o detalle"
                    />
                  </div>
                </div>
                <button class="entry-remove" type="button" onclick="removeDocument(${index})">
                  ×
                </button>
              </article>`,
          )
          .join('') || '<div class="wizard-empty">Aún no agregaste documentos.</div>'
      }
    </div>
    <button type="button" class="btn btn-soft" onclick="addDocument()">＋ Agregar documento</button
    >${wizardActions('Continuar a material OCRI', 'goCallWizardStep(4)', 'Volver', 'goCallWizardStep(2)')}`;
}
function noticeLinks(notice) {
  return (
    notice?.links ||
    (notice?.linkLabel || notice?.linkUrl
      ? [{ label: notice.linkLabel || '', url: notice.linkUrl || '' }]
      : [])
  );
}
function wizardMaterials() {
  const links = noticeLinks(callDraft.notice);
  callDraft.notice.links = links;
  return html`<p class="wizard-intro">
      Adjunta los archivos que OCRI desea compartir con las personas postulantes. La descripción es
      opcional.
    </p>
    <div class="wizard-list">
      ${
        callDraft.resources
          .map(
            (item, index) =>
              html`<article class="wizard-entry">
                <div class="entry-number">${String(index + 1).padStart(2, '0')}</div>
                <div class="entry-fields">
                  <div class="field wide">
                    <label>Adjuntar archivo</label
                    ><input
                      class="input"
                      type="file"
                      name="resource_file_${index}"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                      onchange="selectCallResource(this, ${index})"
                    /><small class="field-help"
                      >${item.fileName ? `Seleccionado: ${esc(item.fileName)}` : 'PDF, Word, Excel o imagen'}</small
                    >
                  </div>
                  <div class="field wide">
                    <label>Descripción <span class="muted">(opcional)</span></label
                    ><input
                      class="input"
                      name="resource_description_${index}"
                      value="${esc(item.description || '')}"
                      placeholder="Ej. Completa esta ficha antes de solicitar la firma"
                    />
                  </div>
                </div>
                <button class="entry-remove" type="button" onclick="removeResource(${index})">
                  ×
                </button>
              </article>`,
          )
          .join('') || '<div class="wizard-empty">Aún no añadiste materiales de OCRI.</div>'
      }
    </div>
    <button type="button" class="btn btn-soft" onclick="addResource()">＋ Adjuntar material</button>
    <div class="important-box">
      <div class="eyebrow">Importante</div>
      <div class="important-links">
        ${
          links
            .map(
              (link, index) =>
                html`<div class="important-link-row">
                  <div class="field">
                    <label>Texto</label
                    ><input
                      class="input"
                      name="notice_link_label_${index}"
                      value="${esc(link.label)}"
                      placeholder="Ej. Revisa el calendario académico"
                    />
                  </div>
                  <div class="field">
                    <label>URL <span class="muted">(opcional)</span></label
                    ><input
                      class="input"
                      name="notice_link_url_${index}"
                      value="${esc(link.url)}"
                      placeholder="https://…"
                    />
                  </div>
                  <button
                    class="entry-remove"
                    type="button"
                    onclick="removeNoticeLink(${index})"
                    aria-label="Quitar información"
                  >
                    ×
                  </button>
                </div>`,
            )
            .join('') || '<div class="wizard-empty">Aún no agregaste información importante.</div>'
        }
      </div>
      <button type="button" class="btn btn-soft btn-sm" onclick="addNoticeLink()">
        ＋ Añadir información importante
      </button>
    </div>
    ${wizardActions('Revisar convocatoria', 'goCallWizardStep(5)', 'Volver', 'goCallWizardStep(3)')}`;
}
function wizardReview() {
  const deadline = callDraft.end ? shortDate(callDraft.end) : 'Pendiente de completar';
  const checks = [
    [
      'Información general',
      Boolean(callDraft.title && callDraft.end),
      callDraft.title || 'Completa el nombre y la fecha límite.',
    ],
    [
      'Requisitos generales',
      callDraft.guidelines.some(Boolean),
      `${callDraft.guidelines.filter(Boolean).length} requisito(s) informativo(s).`,
    ],
    [
      'Documentos a presentar',
      callDraft.documents.length > 0 && callDraft.documents.every((item) => item.title),
      `${callDraft.documents.length} documento(s) configurado(s).`,
    ],
    [
      'Material OCRI',
      true,
      callDraft.resources.length
        ? `${callDraft.resources.length} material(es) compartido(s).`
        : 'Sin materiales adicionales.',
    ],
  ];
  const ready = checks.slice(0, 3).every((check) => check[1]);
  return html`<p class="wizard-intro">Confirma la información antes de publicar.</p>
    <div class="review-summary">
      <div><span>Convocatoria</span><strong>${esc(callDraft.title || 'Sin título')}</strong></div>
      <div><span>Periodo</span><strong>${callDraft.period}</strong></div>
      <div><span>Fecha límite</span><strong>${deadline}</strong></div>
    </div>
    <div class="review-checks">
      ${checks
        .map(
          (check) =>
            html`<article class="review-check ${check[1] ? 'complete' : 'pending'}">
              <span>${check[1] ? '✓' : '!'}</span>
              <div><strong>${check[0]}</strong><small>${esc(check[2])}</small></div>
            </article>`,
        )
        .join('')}
    </div>
    <div class="publication-note">
      <strong>Resumen final de publicación</strong
      ><span
        >Se publicarán requisitos, documentos solicitados, materiales OCRI e información
        importante.</span
      >
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-soft" onclick="goCallWizardStep(4)">Volver</button
      ><button type="button" class="btn btn-soft" onclick="saveCallDraft('BORRADOR')">
        Guardar borrador</button
      ><button
        type="button"
        class="btn btn-primary"
        ${ready ? '' : 'disabled'}
        onclick="saveCallDraft('ACTIVA')"
      >
        Publicar convocatoria
      </button>
    </div>`;
}
function wizardActions(nextLabel, nextAction, backLabel = 'Cancelar', backAction = 'closeModal()') {
  return html`<div class="modal-actions">
    <button type="button" class="btn btn-soft" onclick="${backAction}">${backLabel}</button
    ><button type="button" class="btn btn-primary" onclick="${nextAction}">${nextLabel}</button>
  </div>`;
}
function goCallWizardStep(step) {
  syncCallDraft();
  if (step === 2 && !(callDraft.title && callDraft.end))
    return toast('Completa el nombre y la fecha límite antes de continuar.');
  if (step === 3 && !callDraft.guidelines.some(Boolean))
    return toast('Pega o escribe al menos un requisito general.');
  if (
    step === 4 &&
    (!callDraft.documents.length || callDraft.documents.some((item) => !item.title))
  )
    return toast('Completa al menos un documento a presentar.');
  callWizardStep = step;
  renderCallWizard();
}
function changeCallDirection(direction) {
  syncCallDraft();
  callDraft.direction = direction;
  renderCallWizard();
}
function selectCallCover(input) {
  syncCallDraft();
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    callDraft.coverImage = reader.result;
    callDraft.coverName = file.name;
    callDraft.coverImagePath = '';
    renderCallWizard();
  };
  reader.readAsDataURL(file);
}
function selectCallResource(input, index) {
  syncCallDraft();
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    callDraft.resources[index] = {
      ...callDraft.resources[index],
      dataUrl: reader.result,
      fileName: file.name,
      storagePath: '',
    };
    renderCallWizard();
  };
  reader.readAsDataURL(file);
}
function addDocument() {
  syncCallDraft();
  callDraft.documents.push({ title: '', description: '', required: true });
  renderCallWizard();
}
function removeDocument(index) {
  syncCallDraft();
  callDraft.documents.splice(index, 1);
  renderCallWizard();
}
function addResource() {
  syncCallDraft();
  callDraft.resources.push({ description: '', fileName: '' });
  renderCallWizard();
}
function removeResource(index) {
  syncCallDraft();
  callDraft.resources.splice(index, 1);
  renderCallWizard();
}
function addNoticeLink() {
  syncCallDraft();
  callDraft.notice.links.push({ label: '', url: '' });
  renderCallWizard();
}
function removeNoticeLink(index) {
  syncCallDraft();
  callDraft.notice.links.splice(index, 1);
  renderCallWizard();
}
const storageSafeName = (name) => String(name || 'archivo').replace(/[^a-zA-Z0-9._-]/g, '-');

async function prepareCallAssets() {
  const folder = isUuid(editingCallId) ? editingCallId : crypto.randomUUID();
  if (callDraft.coverImage?.startsWith('data:')) {
    callDraft.coverImagePath = await uploadDataUrl(
      callDraft.coverImage,
      `calls/${folder}/cover-${storageSafeName(callDraft.coverName || 'portada')}`,
    );
  }
  callDraft.resources = await Promise.all(
    callDraft.resources.map(async (resource, index) => {
      if (!resource.dataUrl) return resource;
      const storagePath = await uploadDataUrl(
        resource.dataUrl,
        `calls/${folder}/material-${index + 1}-${storageSafeName(resource.fileName)}`,
      );
      return { ...resource, storagePath, dataUrl: '' };
    }),
  );
}

async function saveCallDraft(status) {
  syncCallDraft();
  const valid =
    callDraft.title &&
    callDraft.end &&
    callDraft.guidelines.some(Boolean) &&
    callDraft.documents.length &&
    callDraft.documents.every((item) => item.title);
  if (status === 'ACTIVA' && !valid) return toast('Aún faltan datos obligatorios para publicar.');
  const edited = isUuid(editingCallId);
  try {
    await prepareCallAssets();
    const payload = {
      ...callDraft,
      id: edited ? editingCallId : null,
      guidelines: callDraft.guidelines.filter(Boolean),
      resources: callDraft.resources.map(({ dataUrl, downloadUrl, ...resource }) => resource),
      status,
    };
    const { error } = await supabase.rpc('admin_upsert_call', { payload });
    if (error) throw error;
    editingCallId = null;
    await loadCallsFromDatabase();
    save();
    closeModal();
    render();
    toast(
      edited
        ? status === 'ACTIVA'
          ? 'Convocatoria actualizada y publicada.'
          : 'Borrador actualizado.'
        : status === 'ACTIVA'
          ? 'Convocatoria publicada.'
          : 'Borrador de convocatoria guardado.',
    );
  } catch (error) {
    toast(`No se pudo guardar la convocatoria: ${error.message}`);
  }
}
function showCallSummary(id) {
  const call = state.calls.find((c) => c.id === id);
  if (!call) return;
  const application = state.applications.find(
    (item) => item.callId === call.id && item.applicantId === session.userId,
  );
  const bullets =
    (call.guidelines || []).map((item) => html`<li>${esc(item)}</li>`).join('') ||
    '<li>Sin requisitos generales.</li>';
  const documents =
    (call.documents || [])
      .map(
        (item) =>
          html`<li>
            <strong>${esc(item.title)}</strong
            ><span
              >${item.required ? 'Obligatorio' : 'Opcional'}${item.description ? ` · ${esc(item.description)}` : ''}</span
            >
          </li>`,
      )
      .join('') || '<li>No hay documentos configurados.</li>';
  const resources =
    (call.resources || [])
      .map(
        (item) =>
          html`<li>
            <strong>${esc(item.fileName || 'Archivo adjunto')}</strong
            >${item.description ? html`<span>${esc(item.description)}</span>` : ''}
            ${
              item.storagePath
                ? html`<button
                    class="btn btn-soft btn-sm"
                    type="button"
                    onclick="downloadCallResource('${call.id}', '${esc(item.storagePath)}')"
                  >
                    Descargar archivo
                  </button>`
                : ''
            }
          </li>`,
      )
      .join('') || '<li>No se proporcionaron materiales adicionales.</li>';
  const links = noticeLinks(call.notice).filter((item) => item.label);
  const notice = links.length
    ? html`<div class="publication-note">
        <strong>Importante</strong>
        <ul class="notice-links">
          ${links.map((link) => html`<li>${link.url ? html`<a href="${esc(link.url)}" target="_blank" rel="noreferrer">${esc(link.label)}</a>` : esc(link.label)}</li>`).join('')}
        </ul>
      </div>`
    : '';
  const adminActions =
    session?.role === 'admin'
      ? html`<button class="btn btn-soft" onclick="editCall('${call.id}')">
            Editar convocatoria
          </button>
          <button class="btn btn-danger" onclick="deleteCall('${call.id}')">
            Eliminar convocatoria
          </button>`
      : '';
  const activeStudentApplication =
    session?.role === 'student' ? getActiveStudentApplication() : null;
  const studentAction =
    session?.role === 'student' && call.direction === 'SALIENTE'
      ? activeStudentApplication && activeStudentApplication.callId !== call.id
        ? html`<div class="call-active-restriction">
            <span>Ya tienes una postulación activa.</span>
            <button
              class="btn btn-primary"
              onclick="openStudentApplication('${activeStudentApplication.id}')"
            >
              Ver mi postulación
            </button>
          </div>`
        : application && application.status !== 'BORRADOR'
          ? html`<button
              class="btn btn-primary"
              onclick="openStudentApplication('${application.id}')"
            >
              Ver mi postulación
            </button>`
          : html`<button class="btn btn-primary" onclick="startApplication('${call.id}')">
              ${application ? 'Continuar postulación' : 'Postular'}
            </button>`
      : '';
  const coverStyle = call.coverImage
    ? ` style="background-image:url('${esc(call.coverImage)}')"`
    : '';
  modal(
    html`<div class="call-detail-hero ${call.coverImage ? 'has-image' : ''}" ${coverStyle}>
        <div class="call-detail-overlay"></div>
        <div class="call-detail-flags">${badge(call.status)}${badge(call.direction)}</div>
        <button class="modal-close call-detail-close" onclick="closeModal()" aria-label="Cerrar">
          ×
        </button>
        <div class="call-detail-title">
          <span>${esc(call.period)} · Límite ${shortDate(call.end)}</span>
          <h2>${esc(call.title)}</h2>
        </div>
      </div>
      <div class="call-detail-content">
        <div class="call-detail-columns">
          <section class="call-detail-section">
            <span class="call-detail-number">01</span>
            <div>
              <h3>Requisitos generales</h3>
              <ul class="summary-list">
                ${bullets}
              </ul>
            </div>
          </section>
          <section class="call-detail-section">
            <span class="call-detail-number">02</span>
            <div>
              <h3>Documentos a presentar</h3>
              <ul class="summary-list">
                ${documents}
              </ul>
            </div>
          </section>
        </div>
        <section class="call-detail-section call-detail-materials">
          <span class="call-detail-number">03</span>
          <div>
            <h3>Material proporcionado por OCRI</h3>
            <ul class="summary-list">
              ${resources}
            </ul>
          </div>
        </section>
        ${notice}
      </div>
      <div class="call-detail-actions">
        ${
          application?.status === 'BORRADOR'
            ? html`<div>
                <strong>Borrador guardado</strong><small>Último avance disponible.</small>
              </div>`
            : '<span></span>'
        }
        <div class="call-detail-buttons">
          ${adminActions}${studentAction}<button class="btn btn-soft" onclick="closeModal()">
            Cerrar
          </button>
        </div>
      </div>`,
    'call-publication-dialog',
  );
}
async function downloadCallResource(callId, storagePath) {
  const call = state.calls.find((item) => item.id === callId);
  const resource = call?.resources?.find((item) => item.storagePath === storagePath);
  if (!resource) return toast('No se encontró el archivo solicitado.');

  const { data, error } = await supabase.storage.from('call-assets').download(storagePath);
  if (error) return toast(`No se pudo descargar el archivo: ${error.message}`);

  const link = document.createElement('a');
  link.href = URL.createObjectURL(data);
  link.download = resource.fileName || 'material-ocri';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}
async function deleteCall(id) {
  const call = state.calls.find((item) => item.id === id);
  if (!call || session?.role !== 'admin') return;
  if (
    !confirm(
      `¿Eliminar definitivamente la convocatoria “${call.title}”? También se eliminarán sus requisitos, documentos y materiales.`,
    )
  )
    return;

  const assetPaths = [
    call.coverImagePath,
    ...(call.resources || []).map((item) => item.storagePath),
  ].filter(Boolean);
  const { error } = await supabase.rpc('admin_delete_call', { target_call_id: id });
  if (error) return toast(`No se pudo eliminar la convocatoria: ${error.message}`);

  if (assetPaths.length) {
    const { error: storageError } = await supabase.storage.from('call-assets').remove(assetPaths);
    if (storageError)
      console.warn('No se pudieron eliminar algunos archivos:', storageError.message);
  }

  await loadCallsFromDatabase();
  save();
  closeModal();
  render();
  toast('Convocatoria eliminada.');
}
function filterCards(v) {
  document
    .querySelectorAll('.call-card')
    .forEach((e) => e.classList.toggle('hidden', v && e.dataset.direction !== v));
}

// -----------------------------------------------------------------------------
// Postulaciones, nominaciones y gestión documental de demostración
// -----------------------------------------------------------------------------
function acceptanceLetterSection(a) {
  const admin = session.role === 'admin';
  const eligible = ['NOMINADO_UNSAAC', 'EN_EVALUACION_DESTINO'].includes(a.status);
  const canUpload = admin
    ? ['APROBADA_OCRI', 'NOMINADO_UNSAAC', 'EN_EVALUACION_DESTINO', 'ACEPTADO'].includes(a.status)
    : a.direction === 'SALIENTE' && a.applicantId === session.userId && eligible;
  return html`<section class="card operational-section">
    <h3>
      Carta de aceptación · ${a.direction === 'SALIENTE' ? 'Universidad de destino' : 'UNSAAC'}
    </h3>
    <p>
      ${a.direction === 'SALIENTE' ? 'Adjunta la carta cuando la universidad de destino te la envíe, después de tu nominación. No es un documento inicial.' : 'OCRI adjunta la carta de aceptación emitida por la UNSAAC.'}
    </p>
    ${
      a.letter
        ? html`<p>${esc(a.letter.file_name)} · ${badge(a.letter.status)}</p>
            <p>${esc(a.letter.comment)}</p>
            <button class="btn btn-soft" onclick="downloadAcceptanceLetter('${a.id}')">
              Descargar carta
            </button>`
        : `<p class="muted">${eligible ? 'Esperando carta de aceptación.' : 'Disponible en una etapa posterior de la postulación.'}</p>`
    }
    ${canUpload ? html`<label class="btn btn-primary">Subir o reemplazar PDF<input type="file" class="visually-hidden" accept="application/pdf" onchange="uploadAcceptanceLetter('${a.id}',this)" /></label>` : ''}
    ${admin && a.letter?.status === 'PENDIENTE' ? html`<button class="btn btn-soft" onclick="reviewAcceptanceLetter('${a.id}',true)">Validar aceptación</button><button class="btn btn-soft" onclick="reviewAcceptanceLetter('${a.id}',false)">Solicitar corrección</button>` : ''}
    ${admin && a.direction === 'SALIENTE' && a.status === 'APROBADA_OCRI' ? html`<button class="btn btn-primary" onclick="nominateApplication('${a.id}')">Registrar nominación UNSAAC</button>` : ''}
  </section>`;
}
async function refreshLetterView(id) {
  await loadApplicationsFromDatabase();
  closeModal();
  render();
  if (session.role === 'admin') detailModal(id);
}
async function uploadAcceptanceLetter(id, input) {
  const file = input.files?.[0];
  if (!file) return;
  if (file.type !== 'application/pdf' || file.size > 10485760)
    return toast('Selecciona un PDF de hasta 10 MB.');
  input.disabled = true;
  try {
    const path = `${id}/${crypto.randomUUID()}.pdf`;
    const { error } = await supabase.storage.from('acceptance-letters').upload(path, file);
    if (error) throw error;
    const saved = await supabase.rpc('save_acceptance_letter', {
      target: id,
      path,
      filename: file.name,
    });
    if (saved.error) throw saved.error;
    await refreshLetterView(id);
    toast('Carta guardada. Pendiente de revisión por OCRI.');
  } catch (error) {
    toast(error.message);
    input.disabled = false;
  }
}
async function downloadAcceptanceLetter(id) {
  const letter = state.applications.find((a) => a.id === id)?.letter;
  if (!letter) return;
  const { data, error } = await supabase.storage
    .from('acceptance-letters')
    .download(letter.storage_path);
  if (error) return toast(error.message);
  const url = URL.createObjectURL(data),
    link = document.createElement('a');
  link.href = url;
  link.download = letter.file_name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function reviewAcceptanceLetter(id, approved) {
  const feedback = approved ? '' : prompt('Indica qué debe corregirse:');
  if (feedback === null || (!approved && !feedback.trim())) return;
  const { error } = await supabase.rpc('review_acceptance_letter', {
    target: id,
    approved,
    feedback,
  });
  if (error) return toast(error.message);
  await refreshLetterView(id);
}
async function nominateApplication(id) {
  if (session.role !== 'admin') return;
  const { data, error } = await supabase
    .from('applications')
    .update({ status: 'NOMINADO_UNSAAC' })
    .eq('id', id)
    .eq('status', 'APROBADA_OCRI')
    .select('id');
  if (error || !data?.length)
    return toast(error?.message || 'El estado cambió. Actualiza el expediente.');
  await refreshLetterView(id);
}
function detailModal(id) {
  const a = state.applications.find((x) => x.id === id);
  if (!a) return;
  modal(
    html`<div class="modal-head">
        <div>
          <h2>${a.displayId || a.id}</h2>
          <span class="muted">${esc(a.student)}</span>
        </div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      ${applicationDetail(a)}${acceptanceLetterSection(a)}${
        /admin|reviewer/.test(session.role)
          ? html`<p class="muted">
              Consulta del expediente. El registro de decisiones institucionales se habilitará en la
              siguiente etapa.
            </p>`
          : ''
      }`,
  );
}
function changeAppStatus(id) {
  const a = state.applications.find((x) => x.id === id),
    s = $('#appStatus').value;
  a.status = s;
  a.history.push([s.replaceAll('_', ' '), new Date().toLocaleDateString('es-PE')]);
  a.progress = s === 'APROBADO_OCRI' ? 100 : a.progress;
  save();
  closeModal();
  render();
  toast('Estado actualizado y registrado');
}
function reviewModal(id, index) {
  const a = state.applications.find((x) => x.id === id),
    d = a.documents[index];
  modal(
    html`<div class="modal-head">
        <h2>Revisar documento</h2>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <p>
        <strong>${esc(d.name)}</strong><br /><span class="muted">${a.id} · ${esc(a.student)}</span>
      </p>
      <div class="field">
        <label>Resultado</label
        ><select class="input" id="docStatus">
          <option>APROBADO</option>
          <option>OBSERVADO</option>
          <option>RECHAZADO</option>
          <option>EN_REVISION</option>
        </select>
      </div>
      <div class="field" style="margin-top:14px">
        <label>Observación</label
        ><textarea
          class="input"
          id="comment"
          placeholder="Detalle la observación si corresponde"
        ></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-soft" onclick="closeModal()">Cancelar</button
        ><button class="btn btn-primary" onclick="saveReview('${id}',${index})">
          Registrar revisión
        </button>
      </div>`,
  );
}
function saveReview(id, i) {
  const a = state.applications.find((x) => x.id === id),
    s = $('#docStatus').value;
  a.documents[i].status = s;
  a.documents[i].comment = $('#comment').value;
  a.documents[i].reviewedBy = session.name;
  a.documents[i].reviewedAt = new Date().toISOString();
  if (s === 'OBSERVADO') a.status = 'OBSERVADO';
  save();
  closeModal();
  render();
  toast('Revisión guardada con trazabilidad');
}
function nominationModal() {
  if (!['admin', 'external_manager'].includes(session.role)) return;
  modal(
    html`<div class="modal-head">
        <h2>Registrar nominación</h2>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <form class="form-grid" onsubmit="createNomination(event)">
        <div class="field wide">
          <label>Estudiante</label><input class="input" name="student" required />
        </div>
        <div class="field">
          <label>Universidad de origen</label
          ><input
            class="input"
            name="university"
            value="${session.role === 'external_manager' ? esc(session.university || '') : ''}"
            ${session.role === 'external_manager' ? 'readonly' : ''}
            required
          />
        </div>
        <div class="field"><label>País</label><input class="input" name="country" required /></div>
        <div class="field wide">
          <label>Correo institucional</label
          ><input class="input" type="email" name="email" required />
        </div>
        <div class="modal-actions wide">
          <button type="button" class="btn btn-soft" onclick="closeModal()">Cancelar</button
          ><button class="btn btn-primary">Guardar borrador de nominación</button>
        </div>
      </form>`,
  );
}
function createNomination(e) {
  e.preventDefault();
  if (!['admin', 'external_manager'].includes(session.role)) return;
  const f = Object.fromEntries(new FormData(e.target));
  if (session.role === 'external_manager') {
    if (!session.university) return toast('Tu cuenta necesita una universidad asignada.');
    f.university = session.university;
  }
  state.nominations.unshift({
    id: `NOM-${String(state.nominations.length + 35).padStart(3, '0')}`,
    ...f,
    status: 'BORRADOR',
  });
  save();
  closeModal();
  render();
  toast('Nominación registrada');
}
async function startApplication(callId) {
  closeModal();
  const activeApplication = getActiveStudentApplication();
  if (activeApplication && activeApplication.callId !== callId) {
    openStudentApplication(activeApplication.id);
    return toast('Ya tienes una postulación activa. Finaliza ese proceso antes de iniciar otro.');
  }
  if (!session.photoPath) {
    const { data: currentProfile, error: profileError } = await supabase
      .from('profiles')
      .select('photo_path')
      .eq('user_id', session.userId)
      .single();
    if (profileError || !currentProfile?.photo_path) {
      route = 'profile';
      render();
      return toast('Antes de postular debes registrar tu foto oficial.');
    }
    session.photoPath = currentProfile.photo_path;
  }
  const call = state.calls.find(
    (item) => item.id === callId && item.direction === 'SALIENTE' && item.status === 'ACTIVA',
  );
  if (!call) return toast('La convocatoria ya no está disponible para postular.');

  const existing = state.applications.find(
    (item) => item.callId === callId && item.applicantId === session.userId,
  );
  if (existing && existing.status !== 'BORRADOR') return openExistingApplication(existing.id);

  if (!academicCatalog.length) {
    await loadAcademicCatalog();
    if (!academicCatalog.length)
      return toast('No se pudo cargar el catálogo de facultades y escuelas profesionales.');
  }

  const existingFaculty = academicCatalog.find((faculty) => faculty.name === existing?.faculty);
  const existingSchool = existingFaculty?.schools.find(
    (school) => school.name === existing?.academicProgram,
  );

  pendingApplicationFiles.clear();
  applicationDraft = {
    id: existing?.id || '',
    callId,
    callTitle: call.title,
    period: call.period,
    studentCode: session.email.split('@')[0].toLowerCase(),
    facultyCode: existingFaculty?.code || '',
    schoolCode: existingSchool?.code || '',
    status: existing?.status || 'BORRADOR',
    documents: existing?.documents?.length
      ? structuredClone(existing.documents)
      : (call.documents || []).map((document) => ({
          id: '',
          requirementId: document.requirementId,
          name: document.title,
          required: document.required,
          storagePath: '',
          fileName: '',
          status: 'PENDIENTE',
        })),
  };
  renderApplicationWizard();
}

function openExistingApplication(applicationId) {
  closeModal();
  const application = state.applications.find((item) => item.id === applicationId);
  if (!application) return toast('No se encontró la postulación.');
  if (application.status === 'BORRADOR') return startApplication(application.callId);
  detailModal(applicationId);
}

function syncApplicationDraft() {
  const form = $('#applicationWizardForm');
  if (!form || !applicationDraft) return;
  const data = new FormData(form);
  if (form.elements.namedItem('facultyCode'))
    applicationDraft.facultyCode = String(data.get('facultyCode') || '').trim();
  if (form.elements.namedItem('schoolCode'))
    applicationDraft.schoolCode = String(data.get('schoolCode') || '').trim();
}

function applicationNavigation() {
  return html`<aside class="wizard-route application-route">
    <div class="eyebrow">Postulación SGMS</div>
    <h3>${esc(applicationDraft.callTitle)}</h3>
    <div class="application-route-summary">
      <span>01</span>
      <div>
        <strong>Documentos</strong>
        <small>Completa tus datos académicos y adjunta el expediente solicitado.</small>
      </div>
    </div>
    <div class="application-draft-note">
      <strong>Borrador privado</strong>
      <span>Tu avance se guarda en tu cuenta y puedes continuar después.</span>
    </div>
  </aside>`;
}

function renderApplicationWizard() {
  const body = html`<div class="wizard-shell">
    <header class="wizard-header">
      <div class="wizard-header-start">
        <strong>SIGMA</strong>
        <span>OFICINA DE COOPERACIÓN Y RELACIONES INTERNACIONALES</span>
      </div>
      <div class="wizard-header-end">
        <span>${esc(applicationDraft.period)} · Mi postulación</span>
        <i aria-label="Escudo UNSAAC"></i>
      </div>
    </header>
    <div class="wizard-layout">
      ${applicationNavigation()}
      <section class="wizard-main application-main">
        <div class="modal-head">
          <div>
            <div class="eyebrow">SGMS / ${esc(applicationDraft.callTitle)}</div>
            <h2>Postulación y documentos</h2>
          </div>
          <button class="wizard-exit" onclick="saveApplicationDraftAndExit()">
            Guardar y salir
          </button>
        </div>
        <form id="applicationWizardForm" onsubmit="return false">${applicationForm()}</form>
      </section>
    </div>
  </div>`;
  const existing = $('#modal .modal');
  if (existing) {
    existing.className = 'modal application-wizard';
    existing.innerHTML = body;
  } else modal(body, 'application-wizard');
}

function applicationForm() {
  const selectedFaculty = academicCatalog.find(
    (faculty) => faculty.code === applicationDraft.facultyCode,
  );
  const schools = selectedFaculty?.schools || [];
  const requiredDocuments = applicationDraft.documents.filter((document) => document.required);
  const completedRequired = requiredDocuments.filter(
    (document) => document.storagePath || pendingApplicationFiles.has(document.requirementId),
  ).length;
  const complete = Boolean(
    applicationDraft.facultyCode &&
    applicationDraft.schoolCode &&
    completedRequired === requiredDocuments.length,
  );

  return html`<div class="application-profile-strip">
      <span class="sidebar-avatar">
        ${session.photoUrl ? html`<img src="${esc(session.photoUrl)}" alt="" />` : esc(session.initials)}
      </span>
      <div><strong>${esc(session.name)}</strong><small>${esc(session.email)}</small></div>
      <span class="application-photo-ok">✓ Foto registrada</span>
    </div>
    <section class="application-section">
      <div class="application-section-heading">
        <span>01</span>
        <div>
          <h3>Datos académicos</h3>
          <p>El código se obtiene automáticamente de tu correo institucional.</p>
        </div>
      </div>
      <div class="form-grid application-form-grid">
        <div class="field">
          <label>Código de estudiante</label>
          <input
            class="input"
            name="studentCode"
            value="${esc(applicationDraft.studentCode)}"
            readonly
          />
        </div>
        <div class="field">
          <label>Facultad</label>
          <select
            class="input"
            name="facultyCode"
            onchange="changeApplicationFaculty(this.value)"
            required
          >
            <option value="">Selecciona tu facultad</option>
            ${academicCatalog.map((faculty) => html`<option value="${esc(faculty.code)}" ${faculty.code === applicationDraft.facultyCode ? 'selected' : ''}>${esc(faculty.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field wide">
          <label>Escuela profesional</label>
          <select
            class="input"
            name="schoolCode"
            onchange="changeApplicationSchool(this.value)"
            ${selectedFaculty ? '' : 'disabled'}
            required
          >
            <option value="">
              ${selectedFaculty ? 'Selecciona tu escuela profesional' : 'Selecciona primero una facultad'}
            </option>
            ${schools.map((school) => html`<option value="${esc(school.code)}" ${school.code === applicationDraft.schoolCode ? 'selected' : ''}>${esc(school.name)}</option>`).join('')}
          </select>
        </div>
      </div>
    </section>
    <section class="application-section">
      <div class="application-section-heading">
        <span>02</span>
        <div>
          <h3>Documentos a presentar</h3>
          <p>Adjunta únicamente los archivos solicitados por OCRI.</p>
        </div>
      </div>
      <div class="application-document-list">
        ${
          applicationDraft.documents.length
            ? applicationDraft.documents
                .map((document, index) => {
                  const pendingFile = pendingApplicationFiles.get(document.requirementId);
                  const fileName = pendingFile?.name || document.fileName;
                  return html`<article class="application-document ${fileName ? 'is-ready' : ''}">
                    <div class="application-document-icon">
                      ${fileName ? '✓' : String(index + 1).padStart(2, '0')}
                    </div>
                    <div class="application-document-copy">
                      <strong>${esc(document.name)}</strong>
                      <small
                        >${document.required ? 'Obligatorio' : 'Opcional'}${fileName ? ` · ${esc(fileName)}` : ' · Pendiente de adjuntar'}</small
                      >
                    </div>
                    <label class="btn btn-soft btn-sm application-upload-button">
                      ${fileName ? 'Reemplazar' : 'Adjuntar'}
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                        onchange="selectApplicationDocument(this, '${document.requirementId}')"
                      />
                    </label>
                  </article>`;
                })
                .join('')
            : '<div class="wizard-empty">Esta convocatoria no solicita documentos.</div>'
        }
      </div>
      <p class="application-security-note">
        🔒 Los archivos son privados y solo podrán verlos tú y el personal autorizado de OCRI.
      </p>
    </section>
    <div class="application-submit-panel">
      <div>
        <strong
          >${complete ? 'Tu postulación está lista' : 'Tu borrador todavía está incompleto'}</strong
        >
        <p>
          ${complete ? `${completedRequired} de ${requiredDocuments.length} documentos obligatorios listos para enviar.` : 'Selecciona tu escuela y adjunta todos los documentos obligatorios. Puedes guardar y continuar después.'}
        </p>
      </div>
      <button
        class="btn btn-primary"
        type="button"
        onclick="submitStudentApplication()"
        ${complete ? '' : 'disabled'}
      >
        Enviar postulación
      </button>
    </div>
    <div class="modal-actions application-wizard-actions">
      <button class="btn btn-soft" type="button" onclick="saveApplicationDraftAndExit()">
        Guardar y continuar después
      </button>
    </div>`;
}

function changeApplicationFaculty(facultyCode) {
  syncApplicationDraft();
  applicationDraft.facultyCode = facultyCode;
  applicationDraft.schoolCode = '';
  renderApplicationWizard();
}

function changeApplicationSchool(schoolCode) {
  applicationDraft.schoolCode = schoolCode;
  renderApplicationWizard();
}

function selectApplicationDocument(input, requirementId) {
  const file = input.files?.[0];
  if (!file) return;
  syncApplicationDraft();
  const validTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
  ];
  if (!validTypes.includes(file.type)) {
    input.value = '';
    return toast('Adjunta un archivo PDF, Word, PNG o JPG.');
  }
  if (file.size > 10 * 1024 * 1024) {
    input.value = '';
    return toast('Cada documento puede pesar como máximo 10 MB.');
  }
  pendingApplicationFiles.set(requirementId, file);
  renderApplicationWizard();
}

async function persistApplicationDraft() {
  syncApplicationDraft();
  const { data: applicationId, error } = await supabase.rpc('student_save_application_draft', {
    payload: {
      callId: applicationDraft.callId,
      facultyCode: applicationDraft.facultyCode,
      schoolCode: applicationDraft.schoolCode,
    },
  });
  if (error) {
    toast(`No se pudo guardar el borrador: ${error.message}`);
    return false;
  }

  for (const [requirementId, file] of pendingApplicationFiles) {
    const path = `${session.userId}/${applicationId}/${requirementId}-${storageSafeName(file.name)}`;
    const previousDocument = applicationDraft.documents.find(
      (document) => document.requirementId === requirementId,
    );
    const { error: uploadError } = await supabase.storage
      .from('application-documents')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      toast(`No se pudo subir ${file.name}: ${uploadError.message}`);
      return false;
    }
    const { error: documentError } = await supabase
      .from('application_documents')
      .update({ storage_path: path, file_name: file.name, status: 'SUBIDO' })
      .eq('application_id', applicationId)
      .eq('requirement_id', requirementId);
    if (documentError) {
      await supabase.storage.from('application-documents').remove([path]);
      toast(`No se pudo registrar ${file.name}: ${documentError.message}`);
      return false;
    }
    if (previousDocument?.storagePath && previousDocument.storagePath !== path)
      await supabase.storage.from('application-documents').remove([previousDocument.storagePath]);
  }
  pendingApplicationFiles.clear();
  await loadApplicationsFromDatabase();
  const saved = state.applications.find((item) => item.id === applicationId);
  if (saved) {
    applicationDraft.id = saved.id;
    applicationDraft.documents = structuredClone(saved.documents);
  }
  return true;
}

async function saveApplicationDraftAndExit() {
  const saved = await persistApplicationDraft();
  if (!saved) return;
  closeModal();
  render();
  toast('Borrador guardado. Puedes continuar cuando quieras.');
}

async function submitStudentApplication() {
  syncApplicationDraft();
  if (!applicationDraft.facultyCode || !applicationDraft.schoolCode)
    return toast('Selecciona tu facultad y escuela profesional.');
  const saved = await persistApplicationDraft();
  if (!saved) return;
  const { error } = await supabase.rpc('student_submit_application', {
    target_application_id: applicationDraft.id,
  });
  if (error) return toast(`No se pudo enviar la postulación: ${error.message}`);
  await loadApplicationsFromDatabase();
  closeModal();
  route = 'sgms';
  render();
  toast('Postulación enviada correctamente a OCRI.');
}
function exportCSV() {
  const rows = [
    ['Expediente', 'Dirección', 'Estudiante', 'Facultad', 'Universidad', 'Estado', 'Fecha'],
    ...state.applications.map((a) => [
      a.id,
      a.direction,
      a.student,
      a.faculty,
      a.destination,
      a.status,
      a.submitted,
    ]),
  ];
  const csv =
    '\ufeff' +
    rows.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'reporte-sigma.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Reporte CSV generado');
}
function universityModal() {
  modal(
    html`<div class="modal-head">
        <h2>Registrar universidad externa</h2>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <p class="muted">Ingrese el dominio oficial sin @; por ejemplo, universidad.edu.</p>
      <form class="form-grid" onsubmit="createUniversity(event)">
        <div class="field wide">
          <label>Nombre de la universidad</label><input class="input" name="name" required />
        </div>
        <div class="field"><label>País</label><input class="input" name="country" required /></div>
        <div class="field">
          <label>Dominio institucional</label
          ><input class="input" name="domain" placeholder="universidad.edu" required />
        </div>
        <div class="modal-actions wide">
          <button type="button" class="btn btn-soft" onclick="closeModal()">Cancelar</button
          ><button class="btn btn-primary">Aprobar y registrar</button>
        </div>
      </form>`,
  );
}
async function createUniversity(event) {
  event.preventDefault();
  const f = Object.fromEntries(new FormData(event.target));
  const { error } = await supabase.rpc('admin_create_university_with_domain', {
    university_name: f.name,
    university_country: f.country,
    institutional_domain: f.domain,
  });
  if (error) return toast(error.message);
  closeModal();
  toast('Universidad y dominio aprobados.');
  views.access();
}
async function designateExternalManager(event) {
  event.preventDefault();
  const f = Object.fromEntries(new FormData(event.target)),
    person = accessProfiles.find((p) => p.email.toLowerCase() === f.email.trim().toLowerCase());
  if (!person) return toast('No existe una cuenta registrada con ese correo.');
  if (
    !person.universities ||
    person.universities.name === 'Universidad Nacional de San Antonio Abad del Cusco'
  )
    return toast('La persona debe pertenecer a una universidad externa aprobada.');
  const { error } = await supabase.rpc('admin_set_user_role', {
    target_user_id: person.user_id,
    target_role_code: 'GESTOR_EXTERNO',
  });
  if (error) return toast(error.message);
  toast('Gestor externo designado.');
  views.access();
}

// -----------------------------------------------------------------------------
// Inicio de la aplicación y funciones invocadas desde los eventos HTML
// -----------------------------------------------------------------------------
// Punto de entrada: restaura sesiones y reacciona a login, recuperación y cierre de sesión.
async function boot() {
  if (!supabase) return login();
  const {
    data: { session: authSession },
  } = await supabase.auth.getSession();
  if (authSession) await loadSession(authSession.user);
  else login();
  supabase.auth.onAuthStateChange(async (event, nextSession) => {
    if (event === 'PASSWORD_RECOVERY') passwordRecoveryMode = true;
    if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && nextSession)
      await loadSession(nextSession.user);
    if (event === 'SIGNED_OUT') login();
  });
}
Object.assign(window, {
  $,
  login,
  showLoginForm,
  signIn,
  requestPasswordReset,
  showRegister,
  showRecover,
  togglePassword,
  toggleStudentAccountMenu,
  register,
  setPassword,
  signOut,
  go,
  callModal,
  editCall,
  goCallWizardStep,
  changeCallDirection,
  selectCallCover,
  selectCallResource,
  addDocument,
  removeDocument,
  addResource,
  removeResource,
  addNoticeLink,
  removeNoticeLink,
  saveCallDraft,
  showCallSummary,
  downloadCallResource,
  deleteCall,
  filterCards,
  openOperationalQueue,
  filterOperationalQueue,
  detailModal,
  uploadAcceptanceLetter,
  downloadAcceptanceLetter,
  reviewAcceptanceLetter,
  nominateApplication,
  changeAppStatus,
  reviewModal,
  saveReview,
  saveProfile,
  selectProfilePhoto,
  previewProfilePhoto,
  viewProfilePhoto,
  updateProfilePhotoFromPreview,
  nominationModal,
  createNomination,
  startApplication,
  openExistingApplication,
  openStudentApplication,
  changeApplicationFaculty,
  changeApplicationSchool,
  selectApplicationDocument,
  saveApplicationDraftAndExit,
  submitStudentApplication,
  exportCSV,
  closeModal,
  universityModal,
  createUniversity,
  designateExternalManager,
});
boot();
