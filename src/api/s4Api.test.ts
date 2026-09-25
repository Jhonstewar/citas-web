// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminAppointment,
  adminRescheduleScript,
  appointmentDetail,
  eps,
  epsAdminScript,
  epsPlan,
  installBackend,
  insurancePlan,
  passwordScript,
  patientLifecycleScript,
  professionalAppointment,
  professionalAppointmentsScript,
  profileScript,
  RECOVERY_MESSAGE,
  rescheduleRequest,
  SITE_HIC,
  userWith,
  type Call,
} from '../test/fakeBackend';
import { ApiError } from './ApiError';
import * as adminApi from './adminApi';
import * as authApi from './authApi';
import { API_ROUTES, ERROR_CODES, type UserResponse } from './contracts';
import { setAccessTokenProvider } from './httpClient';
import * as patientApi from './patientApi';
import * as professionalApi from './professionalApi';
import * as userApi from './userApi';
import { validatePasswordPolicy, validateResetPasswordForm } from '../validation/authValidation';

/**
 * S4 — capa de integración REST contra el contrato acordado (`contrato-rest-citas.md` §S4 y
 * `contrato-rest-identidad.md` §S4). El backend aún no implementa estas rutas: se prueba contra
 * el fake de `src/test/fakeBackend.tsx`, que reproduce las respuestas y los códigos del contrato.
 */

/** Ejecuta la promesa y devuelve el `ApiError` con que falla. */
async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (cause) {
    if (cause instanceof ApiError) return cause;
    throw cause;
  }
  throw new Error('La petición debía fallar');
}

function last(calls: Call[]): Call {
  const call = calls.at(-1);
  if (call === undefined) throw new Error('No salió ninguna petición');
  return call;
}

beforeEach(() => {
  setAccessTokenProvider(() => 'access-1');
});

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessTokenProvider(() => null);
});

describe('API_ROUTES — rutas S4 del contrato', () => {
  it('coinciden literalmente con el contrato', () => {
    expect(API_ROUTES.auth.passwordRecovery).toBe('/api/auth/password-recovery');
    expect(API_ROUTES.auth.passwordReset).toBe('/api/auth/password-reset');
    expect(API_ROUTES.me).toBe('/api/me');
    expect(API_ROUTES.meAffiliation).toBe('/api/me/affiliation');
    expect(API_ROUTES.catalogs.rescheduleStatuses).toBe('/api/catalogs/reschedule-statuses');
    expect(API_ROUTES.patient.cancelAppointment(7)).toBe('/api/patient/appointments/7/cancel');
    expect(API_ROUTES.patient.rescheduleAppointment(7)).toBe('/api/patient/appointments/7/reschedule');
    expect(API_ROUTES.professional.appointments).toBe('/api/professional/appointments');
    expect(API_ROUTES.professional.completeAppointment(7)).toBe('/api/professional/appointments/7/complete');
    expect(API_ROUTES.professional.noShowAppointment(7)).toBe('/api/professional/appointments/7/no-show');
    expect(API_ROUTES.admin.approveReschedule(7)).toBe('/api/admin/reschedules/7/approve');
    expect(API_ROUTES.admin.rejectReschedule(7)).toBe('/api/admin/reschedules/7/reject');
    expect(API_ROUTES.admin.epsList).toBe('/api/admin/eps');
    expect(API_ROUTES.admin.eps(7)).toBe('/api/admin/eps/7');
    expect(API_ROUTES.admin.epsStatus(7)).toBe('/api/admin/eps/7/status');
    expect(API_ROUTES.admin.epsPlans(7)).toBe('/api/admin/eps/7/plans');
    expect(API_ROUTES.admin.epsPlan(7)).toBe('/api/admin/eps-plans/7');
    expect(API_ROUTES.admin.epsPlanStatus(7)).toBe('/api/admin/eps-plans/7/status');
  });

  it('declara los códigos de error nuevos', () => {
    expect(ERROR_CODES).toMatchObject({
      appointmentNotStarted: 'APPOINTMENT_NOT_STARTED',
      reschedulePending: 'RESCHEDULE_PENDING',
      epsReferenced: 'EPS_REFERENCED',
      planReferenced: 'PLAN_REFERENCED',
      sameSlot: 'SAME_SLOT',
      fieldNotEditable: 'FIELD_NOT_EDITABLE',
      resetTokenInvalid: 'RESET_TOKEN_INVALID',
    });
  });
});

describe('patientApi — cancelar y reprogramar (HU-026, HU-027)', () => {
  it('cancela con Bearer; sin motivo el cuerpo va vacío y con motivo va recortado', async () => {
    const calls = installBackend(patientLifecycleScript(appointmentDetail({ id: 100 })));

    const cancelled = await patientApi.cancelAppointment(100, '  No puedo asistir  ');

    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancellable).toBe(false);
    expect(last(calls)).toMatchObject({
      method: 'POST',
      path: '/api/patient/appointments/100/cancel',
      authorization: 'Bearer access-1',
      body: { reason: 'No puedo asistir' },
    });

    // Cancelar otra vez una cita terminal: 409 INVALID_TRANSITION.
    const error = await failure(patientApi.cancelAppointment(100));
    expect(last(calls).body).toEqual({});
    expect(error.kind).toBe('conflict');
    expect(error.code).toBe(ERROR_CODES.invalidTransition);
  });

  it('pide la reprogramación (201 PENDING) y un segundo intento da 409 RESCHEDULE_PENDING', async () => {
    const calls = installBackend(patientLifecycleScript(appointmentDetail({ id: 100 })));

    const created = await patientApi.requestReschedule(100, {
      siteId: SITE_HIC.id,
      date: '2099-10-08',
      startTime: '10:00',
      reason: '   ',
    });

    expect(created.status).toBe('PENDING');
    expect(created.proposed).toMatchObject({ date: '2099-10-08', startTime: '10:00', endTime: '11:00' });
    // Un motivo en blanco no viaja; profesional y especialidad tampoco (se conservan).
    expect(last(calls).body).toEqual({ siteId: SITE_HIC.id, date: '2099-10-08', startTime: '10:00' });

    const error = await failure(
      patientApi.requestReschedule(100, { siteId: SITE_HIC.id, date: '2099-10-09', startTime: '10:00' }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.kind).toBe('conflict');
    expect(error.code).toBe(ERROR_CODES.reschedulePending);
    // El mensaje es el `detail` del servidor, no un genérico.
    expect(error.message).toBe('La cita ya tiene una reprogramación pendiente');
  });

  it('la misma franja da 422 SAME_SLOT, clasificado como validación', async () => {
    const detail = appointmentDetail({ id: 100 });
    installBackend(patientLifecycleScript(detail));

    const error = await failure(
      patientApi.requestReschedule(100, {
        siteId: detail.site.id,
        date: detail.date,
        startTime: detail.startTime,
      }),
    );

    expect(error.status).toBe(422);
    expect(error.kind).toBe('validation');
    expect(error.code).toBe(ERROR_CODES.sameSlot);
  });
});

describe('professionalApi — agenda y cierre (HU-020, HU-021)', () => {
  it('lista con from/to y siteId opcional en la cadena de consulta', async () => {
    const calls = installBackend(
      professionalAppointmentsScript([
        professionalAppointment({ id: 1, date: '2099-10-01' }),
        professionalAppointment({ id: 2, date: '2099-10-05' }),
      ]),
    );

    const day = await professionalApi.listAppointments('2099-10-01', '2099-10-01');
    expect(day.map((appointment) => appointment.id)).toEqual([1]);
    expect(last(calls).query).toEqual({ from: '2099-10-01', to: '2099-10-01' });

    await professionalApi.listAppointments('2099-10-01', '2099-10-31', 2);
    expect(last(calls).query).toEqual({ from: '2099-10-01', to: '2099-10-31', siteId: '2' });
  });

  it('cerrar antes de la hora da 409 APPOINTMENT_NOT_STARTED; después, COMPLETED y NO_SHOW', async () => {
    const calls = installBackend(
      professionalAppointmentsScript([
        professionalAppointment({ id: 1, closable: false }),
        professionalAppointment({ id: 2, closable: true }),
        professionalAppointment({ id: 3, closable: true }),
      ]),
    );

    const early = await failure(professionalApi.completeAppointment(1));
    expect(early.kind).toBe('conflict');
    expect(early.code).toBe(ERROR_CODES.appointmentNotStarted);

    expect((await professionalApi.completeAppointment(2)).status).toBe('COMPLETED');
    expect(last(calls).path).toBe('/api/professional/appointments/2/complete');

    expect((await professionalApi.markNoShow(3)).status).toBe('NO_SHOW');
    expect(last(calls)).toMatchObject({ method: 'POST', path: '/api/professional/appointments/3/no-show' });

    const again = await failure(professionalApi.markNoShow(3));
    expect(again.code).toBe(ERROR_CODES.invalidTransition);
  });
});

describe('adminApi — reprogramaciones y EPS (HU-031, HU-012)', () => {
  const reschedule = rescheduleRequest({ id: 500, appointmentId: 100 });
  const inbox = [
    { type: 'APPOINTMENT_REQUEST' as const, appointment: adminAppointment({ id: 90, status: 'REQUESTED' }) },
    { type: 'RESCHEDULE_REQUEST' as const, appointment: adminAppointment({ id: 100 }), reschedule },
  ];

  it('filtra la bandeja por type y distingue la entrada por su discriminante', async () => {
    const calls = installBackend(adminRescheduleScript(inbox));

    const entries = await adminApi.getInbox({ type: 'RESCHEDULE_REQUEST' });

    expect(last(calls).query).toEqual({ type: 'RESCHEDULE_REQUEST' });
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    if (entry?.type !== 'RESCHEDULE_REQUEST') throw new Error('Se esperaba una reprogramación');
    expect(entry.reschedule.id).toBe(500);
  });

  it('aprobar mueve la cita a la franja propuesta; decidir otra vez da 409 INVALID_TRANSITION', async () => {
    installBackend(adminRescheduleScript(inbox));

    const moved = await adminApi.approveReschedule(500);

    expect(moved).toMatchObject({ id: 100, date: reschedule.proposed.date, site: reschedule.proposed.site });
    expect(moved.lastReschedule?.status).toBe('APPROVED');

    const error = await failure(adminApi.rejectReschedule(500, 'tarde'));
    expect(error.kind).toBe('conflict');
    expect(error.code).toBe(ERROR_CODES.invalidTransition);

    // Ya no figura en la bandeja; un id inexistente da 404.
    expect(await adminApi.getInbox({ type: 'RESCHEDULE_REQUEST' })).toEqual([]);
    expect((await failure(adminApi.approveReschedule(999))).status).toBe(404);
  });

  it('rechazar sin motivo da 400 de validación con fieldErrors', async () => {
    installBackend(adminRescheduleScript(inbox));

    const error = await failure(adminApi.rejectReschedule(500, ''));

    expect(error.kind).toBe('validation');
    expect(error.fieldErrors.reason).toBeDefined();
  });

  it('EPS: DUPLICATE con field, EPS_REFERENCED y PLAN_REFERENCED', async () => {
    const calls = installBackend(
      epsAdminScript([eps({ id: 1 })], [epsPlan({ id: 3, epsId: 1 })], [3]),
    );

    expect((await adminApi.listEps())[0]?.planCount).toBe(1);

    // Aclaración 9: GET /api/admin/eps/{id} → 200 Eps · 404.
    expect((await adminApi.getEps(1)).planCount).toBe(1);
    expect(last(calls)).toMatchObject({ method: 'GET', path: '/api/admin/eps/1' });
    expect((await failure(adminApi.getEps(999))).kind).toBe('not_found');

    const duplicated = await failure(adminApi.createEps({ code: 'eps_demo', name: 'Otra' }));
    expect(duplicated.code).toBe(ERROR_CODES.duplicate);
    expect(duplicated.field).toBe('code');

    const epsInUse = await failure(adminApi.deleteEps(1));
    expect(epsInUse.code).toBe(ERROR_CODES.epsReferenced);

    const planInUse = await failure(adminApi.deleteEpsPlan(3));
    expect(planInUse.code).toBe(ERROR_CODES.planReferenced);
    expect(last(calls)).toMatchObject({ method: 'DELETE', path: '/api/admin/eps-plans/3' });

    const created = await adminApi.createEpsPlan(1, { code: 'SUB', name: 'Subsidiado', regimeCode: 'SUBSIDIADO' });
    expect(last(calls)).toMatchObject({ method: 'POST', path: '/api/admin/eps/1/plans' });
    expect(created.regime.code).toBe('SUBSIDIADO');

    expect((await adminApi.setEpsPlanActive(created.id, false)).active).toBe(false);
    expect(last(calls)).toMatchObject({ method: 'PATCH', body: { active: false } });
  });
});

describe('userApi — perfil y afiliación (HU-008, HU-009)', () => {
  const user = userWith('USER') as UserResponse;

  it('edita el perfil con PUT /api/me', async () => {
    const calls = installBackend(profileScript(user));

    const updated = await userApi.updateProfile({ firstNames: 'Ana', lastNames: 'Pérez', phone: '3110000000' });

    expect(updated.firstNames).toBe('Ana');
    expect(last(calls)).toMatchObject({ method: 'PUT', path: '/api/me', authorization: 'Bearer access-1' });
  });

  it('un plan no disponible da 422 INSURANCE_PLAN_UNAVAILABLE; quitar la afiliación responde 204', async () => {
    const calls = installBackend(profileScript(user, [insurancePlan({ id: 3 })]));

    const error = await failure(userApi.setAffiliation(99));
    expect(error.kind).toBe('validation');
    expect(error.code).toBe(ERROR_CODES.insurancePlanUnavailable);

    const current = await userApi.setAffiliation(3);
    expect(current.plan.id).toBe(3);
    expect(last(calls).body).toEqual({ insurancePlanId: 3 });

    await expect(userApi.removeAffiliation()).resolves.toBeUndefined();
    expect(last(calls)).toMatchObject({ method: 'DELETE', path: '/api/me/affiliation' });
    expect((await userApi.getCurrentUser()).affiliation).toBeNull();
  });
});

describe('authApi — recuperación y restablecimiento (HU-006, HU-007)', () => {
  it('la recuperación responde 202 con message y devToken solo en laboratorio', async () => {
    installBackend(passwordScript({ validToken: 'tok', knownEmails: ['ana@fcv.test'], exposeToken: true }));

    expect(await authApi.requestPasswordRecovery({ email: 'nadie@fcv.test' })).toEqual({
      message: RECOVERY_MESSAGE,
    });
    expect(await authApi.requestPasswordRecovery({ email: 'ana@fcv.test' })).toEqual({
      message: RECOVERY_MESSAGE,
      devToken: 'tok',
    });
  });

  it('restablece sin Bearer (204) y reutilizar el token da 400 RESET_TOKEN_INVALID', async () => {
    const calls = installBackend(passwordScript({ validToken: 'tok' }));

    await expect(authApi.resetPassword({ token: 'tok', newPassword: 'Nueva-clave1' })).resolves.toBeUndefined();
    expect(last(calls)).toMatchObject({
      method: 'POST',
      path: '/api/auth/password-reset',
      authorization: undefined,
      body: { token: 'tok', newPassword: 'Nueva-clave1' },
    });

    const error = await failure(authApi.resetPassword({ token: 'tok', newPassword: 'Nueva-clave1' }));
    expect(error.status).toBe(400);
    expect(error.kind).toBe('validation');
    expect(error.code).toBe(ERROR_CODES.resetTokenInvalid);
  });
});

describe('política de contraseña D29 en el cliente', () => {
  it('exige 8 caracteres, una letra, un dígito y como mucho 72 bytes UTF-8', () => {
    expect(validatePasswordPolicy('clave123')).toBeUndefined();
    expect(validatePasswordPolicy('')).toBeDefined();
    expect(validatePasswordPolicy('clave12')).toMatch(/al menos 8/);
    expect(validatePasswordPolicy('clavesinnumero')).toMatch(/letra y un número/);
    expect(validatePasswordPolicy('12345678')).toMatch(/letra y un número/);
    // 72 bytes exactos pasan; 40 eñes + "a1" son 82 bytes (42 caracteres) y no.
    expect(validatePasswordPolicy(`${'a'.repeat(71)}1`)).toBeUndefined();
    expect(validatePasswordPolicy(`${'ñ'.repeat(40)}a1`)).toMatch(/72 bytes/);
  });

  it('cuenta como letra cualquier letra Unicode (ñ, vocales con tilde), no solo A-Z', () => {
    expect(validatePasswordPolicy('ññññññ12')).toBeUndefined();
    expect(validatePasswordPolicy('áéíóúü12')).toBeUndefined();
    // Símbolos y dígitos no son letras.
    expect(validatePasswordPolicy('#$%&()12')).toMatch(/letra y un número/);
  });

  it('el formulario de restablecer valida la política y la confirmación', () => {
    expect(validateResetPasswordForm({ newPassword: 'clave123', passwordConfirm: 'clave123' })).toEqual({});
    expect(validateResetPasswordForm({ newPassword: 'clave123', passwordConfirm: 'otra1234' })).toHaveProperty(
      'passwordConfirm',
    );
    expect(validateResetPasswordForm({ newPassword: 'corta', passwordConfirm: 'corta' })).toHaveProperty(
      'newPassword',
    );
  });
});
