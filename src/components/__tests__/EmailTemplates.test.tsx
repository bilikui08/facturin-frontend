import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EmailTemplates from "../EmailTemplates";

const getEmailTemplates = vi.fn();
const previewEmailTemplate = vi.fn();
const saveEmailTemplate = vi.fn();
const restoreEmailTemplate = vi.fn();
const sendTestEmail = vi.fn();
let systemAdmin = true;

vi.mock("../../services/systemService", () => ({
  getEmailTemplates: (...a: unknown[]) => getEmailTemplates(...a),
  previewEmailTemplate: (...a: unknown[]) => previewEmailTemplate(...a),
  saveEmailTemplate: (...a: unknown[]) => saveEmailTemplate(...a),
  restoreEmailTemplate: (...a: unknown[]) => restoreEmailTemplate(...a),
  sendTestEmail: (...a: unknown[]) => sendTestEmail(...a),
}));
vi.mock("../../hooks/useSystemAdmin", () => ({ useSystemAdmin: () => systemAdmin }));

const draft = { subject: "{invitador} te invitó a {empresa}", heading: "Te invitaron", body: "Hola **{invitador}**", button_label: "Aceptar" };
const template = (extra = {}) => ({
  key: "invitation",
  label: "Invitación a una empresa",
  description: "Le llega a una persona sin cuenta.",
  variables: [
    { name: "invitador", description: "Nombre de quien invita", example: "Ana Pérez", editable: true },
    { name: "empresa", description: "Nombre de la empresa", example: "Empresa de Ejemplo SA", editable: true },
    { name: "sistema", description: "Nombre del sistema", example: null, editable: false },
  ],
  is_customized: false,
  current: draft,
  defaults: draft,
  ...extra,
});
const second = template({ key: "added_to_organization", label: "Te sumaron a una empresa" });

/** Deja pasar el tiempo de espera de la vista previa (se escribe y recién después se consulta). */
const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(700);
  });
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  systemAdmin = true;
  getEmailTemplates.mockReset().mockResolvedValue([template(), second]);
  previewEmailTemplate.mockReset().mockResolvedValue({ subject: "Ana te invitó a Empresa", html: "<p>correo</p>" });
  saveEmailTemplate.mockReset().mockResolvedValue(template({ is_customized: true }));
  restoreEmailTemplate.mockReset().mockResolvedValue(template());
  sendTestEmail.mockReset().mockResolvedValue({ sent: true, to: "yo@ejemplo.com" });
});

afterEach(() => vi.useRealTimers());

describe("Emails (plantillas)", () => {
  it("quien no es administradora del sistema ve el aviso", async () => {
    systemAdmin = false;
    render(<EmailTemplates />);

    expect(await screen.findByText("No tenés permiso para ver esta pantalla")).toBeTruthy();
    expect(getEmailTemplates).not.toHaveBeenCalled();
  });

  it("lista las plantillas y muestra la primera con sus campos y variables", async () => {
    render(<EmailTemplates />);

    expect(await screen.findByRole("tab", { name: /Invitación a una empresa/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Te sumaron a una empresa/ })).toBeTruthy();
    expect((screen.getByLabelText("Asunto") as HTMLInputElement).value).toBe("{invitador} te invitó a {empresa}");
    expect((screen.getByLabelText("Texto") as HTMLTextAreaElement).value).toBe("Hola **{invitador}**");
    expect(screen.getByRole("button", { name: "Insertar Nombre de quien invita" })).toBeTruthy();
    expect(screen.getByText(/No admite enlaces ni HTML/)).toBeTruthy();
    expect(screen.getByText(/El enlace del botón lo agrega el sistema/)).toBeTruthy();
  });

  it("explica que las variables las completa el sistema y deja probarlas con otro dato", async () => {
    render(<EmailTemplates />);
    await screen.findByLabelText("Asunto");

    expect(screen.getByText(/no se completan a mano/)).toBeTruthy();
    expect(screen.getByText(/el sistema las\s+reemplaza solo con los datos reales/)).toBeTruthy();
    expect(screen.getByText("Nombre de quien invita")).toBeTruthy();
    expect((screen.getByLabelText("Ejemplo de {invitador}") as HTMLInputElement).value).toBe("Ana Pérez");
    expect(screen.getByText("Lo toma de Sistema")).toBeTruthy(); // {sistema} no se prueba con otro dato desde acá
    expect(screen.queryByLabelText("Ejemplo de {sistema}")).toBeNull();
  });

  it("probar con otro dato (Juancito) vuelve a armar la vista previa sin tocar la plantilla ni guardar nada", async () => {
    render(<EmailTemplates />);
    await screen.findByLabelText("Asunto");
    await settle();
    previewEmailTemplate.mockClear();

    fireEvent.change(screen.getByLabelText("Ejemplo de {invitador}"), { target: { value: "Juancito" } });
    await settle();

    expect(previewEmailTemplate).toHaveBeenCalledTimes(1);
    expect(previewEmailTemplate.mock.calls[0][1]).toEqual(draft); // el texto de la plantilla no cambió
    expect(previewEmailTemplate.mock.calls[0][2]).toEqual({ invitador: "Juancito", empresa: "Empresa de Ejemplo SA" });
    expect(saveEmailTemplate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toHaveProperty("disabled", true); // no es un cambio de la plantilla
  });

  it("muestra la vista previa con el asunto, en un iframe aislado, una vez que se deja de escribir", async () => {
    render(<EmailTemplates />);
    await screen.findByLabelText("Asunto");
    await settle();

    expect(await screen.findByText("Ana te invitó a Empresa")).toBeTruthy();
    const frame = screen.getByTitle("Vista previa del correo") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe(""); // sin permisos: no ejecuta nada
    expect(frame.getAttribute("srcdoc")).toBe("<p>correo</p>");
  });

  it("al escribir pide una vista previa nueva con el borrador (sin guardarlo)", async () => {
    render(<EmailTemplates />);
    const heading = await screen.findByLabelText("Título");
    await settle();
    previewEmailTemplate.mockClear();

    fireEvent.change(heading, { target: { value: "Título nuevo" } });
    await settle();

    expect(previewEmailTemplate).toHaveBeenCalledTimes(1);
    expect(previewEmailTemplate.mock.calls[0][0]).toBe("invitation");
    expect(previewEmailTemplate.mock.calls[0][1]).toEqual({ ...draft, heading: "Título nuevo" });
    expect(previewEmailTemplate.mock.calls[0][2]).toEqual({ invitador: "Ana Pérez", empresa: "Empresa de Ejemplo SA" });
    expect(saveEmailTemplate).not.toHaveBeenCalled();
  });

  it("si el borrador no es válido (un enlace, por ejemplo) muestra el motivo, sin correo, y no deja guardar ni probar", async () => {
    previewEmailTemplate.mockRejectedValue(new Error("No puede incluir enlaces ni HTML: el enlace del botón lo agrega el sistema."));
    render(<EmailTemplates />);
    const body = await screen.findByLabelText("Texto");

    fireEvent.change(body, { target: { value: "Entrá a https://malo.example.com" } });
    await settle();

    expect(await screen.findByText(/No puede incluir enlaces ni HTML/)).toBeTruthy();
    expect(screen.queryByTitle("Vista previa del correo")).toBeNull();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /Enviar prueba/ })).toHaveProperty("disabled", true);
  });

  it("insertar una variable la pone donde está el cursor", async () => {
    render(<EmailTemplates />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const heading = (await screen.findByLabelText("Título")) as HTMLInputElement;

    heading.focus();
    heading.setSelectionRange(0, 0);
    await user.click(screen.getByRole("button", { name: "Insertar Nombre de la empresa" }));

    // el clic mueve el foco al botón: sin cursor en un campo, la variable va al final del texto
    expect((screen.getByLabelText("Texto") as HTMLTextAreaElement).value).toContain("{empresa}");
  });

  it("guarda lo editado y avisa", async () => {
    render(<EmailTemplates />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const heading = await screen.findByLabelText("Título");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toHaveProperty("disabled", true);

    fireEvent.change(heading, { target: { value: "Título nuevo" } });
    await settle();
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(saveEmailTemplate).toHaveBeenCalledWith("invitation", { ...draft, heading: "Título nuevo" }));
    expect(await screen.findByText("Plantilla guardada. Los próximos correos la van a usar.")).toBeTruthy();
    expect(getEmailTemplates).toHaveBeenCalledTimes(2); // recarga la lista (queda «Personalizada»)
  });

  it("el aviso de guardado no se pierde cuando la lista se recarga con la versión guardada", async () => {
    const saved = { ...draft, heading: "Título nuevo" };
    getEmailTemplates.mockResolvedValueOnce([template(), second]).mockResolvedValue([template({ is_customized: true, current: saved }), second]);
    render(<EmailTemplates />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    fireEvent.change(await screen.findByLabelText("Título"), { target: { value: "Título nuevo" } });
    await settle();
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("Personalizada")).toBeTruthy(); // el editor se volvió a armar con lo guardado
    expect(screen.getByText("Plantilla guardada. Los próximos correos la van a usar.")).toBeTruthy();
    expect((screen.getByLabelText("Título") as HTMLInputElement).value).toBe("Título nuevo");
  });

  it("manda la prueba con el borrador, a la casilla de quien lo pide", async () => {
    render(<EmailTemplates />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    fireEvent.change(await screen.findByLabelText("Título"), { target: { value: "Probando" } });
    await settle();

    await user.click(screen.getByRole("button", { name: /Enviar prueba a mi correo/ }));

    await waitFor(() => expect(sendTestEmail).toHaveBeenCalledWith("invitation", { ...draft, heading: "Probando" }, { invitador: "Ana Pérez", empresa: "Empresa de Ejemplo SA" }));
    expect(await screen.findByText("Correo de prueba enviado a yo@ejemplo.com.")).toBeTruthy();
  });

  it("si el servidor no pudo enviar la prueba lo dice como error", async () => {
    sendTestEmail.mockResolvedValue({ sent: false, to: "yo@ejemplo.com" });
    render(<EmailTemplates />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await screen.findByLabelText("Asunto");
    await settle();

    await user.click(screen.getByRole("button", { name: /Enviar prueba a mi correo/ }));

    expect(await screen.findByText(/No se pudo enviar el correo de prueba/)).toBeTruthy();
  });

  it("restaurar el original pide confirmación y solo está disponible si hay una versión propia", async () => {
    getEmailTemplates.mockResolvedValue([template({ is_customized: true }), second]);
    render(<EmailTemplates />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    expect(await screen.findByText("Personalizada")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Restaurar el original/ }));
    const confirm = within(await screen.findByRole("alertdialog"));
    expect(restoreEmailTemplate).not.toHaveBeenCalled();
    await user.click(confirm.getByRole("button", { name: "Restaurar" }));

    await waitFor(() => expect(restoreEmailTemplate).toHaveBeenCalledWith("invitation"));
    expect(await screen.findByText("Se restauró el original.")).toBeTruthy();
  });

  it("sin versión propia el botón de restaurar está deshabilitado", async () => {
    render(<EmailTemplates />);

    await screen.findByLabelText("Asunto");
    expect(screen.getByRole("button", { name: /Restaurar el original/ })).toHaveProperty("disabled", true);
  });

  it("cambiar de plantilla muestra la otra", async () => {
    getEmailTemplates.mockResolvedValue([template(), template({ key: "added_to_organization", label: "Te sumaron a una empresa", current: { ...draft, heading: "Ahora trabajás con vos" } })]);
    render(<EmailTemplates />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.click(await screen.findByRole("tab", { name: /Te sumaron a una empresa/ }));

    expect((await screen.findByLabelText("Título") as HTMLInputElement).value).toBe("Ahora trabajás con vos");
  });
});
