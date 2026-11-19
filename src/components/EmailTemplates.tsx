import { useEffect, useMemo, useState } from "react";
import { Mail, RotateCcw, Save, Send } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useSystemAdmin } from "../hooks/useSystemAdmin";
import {
  getEmailTemplates,
  previewEmailTemplate,
  restoreEmailTemplate,
  saveEmailTemplate,
  sendTestEmail,
  type EmailPreview,
  type EmailTemplate,
  type EmailTemplateDraft,
} from "../services/systemService";
import FormField from "./FormField";
import LoadingBlock from "./LoadingBlock";
import { NoPermission } from "./RequirePermission";
import StatusAlert from "./StatusAlert";
import { useQuery } from "./useQuery";

type Field = keyof EmailTemplateDraft;

const FIELDS: { name: Field; label: string; max: number; multiline?: boolean; hint?: string }[] = [
  { name: "subject", label: "Asunto", max: 150 },
  { name: "heading", label: "Título", max: 120 },
  { name: "body", label: "Texto", max: 4000, multiline: true, hint: "Una línea en blanco separa párrafos. **Así** se pone en negrita. No admite enlaces ni HTML." },
  { name: "button_label", label: "Texto del botón", max: 40, hint: "El enlace del botón lo agrega el sistema." },
];

const same = (a: EmailTemplateDraft, b: EmailTemplateDraft) => FIELDS.every(({ name }) => a[name] === b[name]);

const PREVIEW_DELAY_MS = 500;

/** Editor de una plantilla: campos, variables, vista previa en vivo, guardar, volver al original y prueba de envío. */
type Notice = { kind: "success" | "error"; text: string } | null;

interface TemplateEditorProps {
  template: EmailTemplate;
  onChanged: () => void;
  /** El aviso vive en el padre: al guardar se recarga la plantilla y el editor se vuelve a armar, y no debe perderse el mensaje. */
  notice: Notice;
  setNotice: (notice: Notice) => void;
}

const TemplateEditor = ({ template, onChanged, notice, setNotice }: TemplateEditorProps) => {
  const [draft, setDraft] = useState<EmailTemplateDraft>(template.current);
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);

  const dirty = !same(draft, template.current);

  // Vista previa en vivo: espera a que se deje de escribir y muestra el correo completo con datos de ejemplo. Si el
  // borrador no es válido (por ejemplo, tiene un enlace) el servidor lo rechaza y se muestra el motivo en lugar del correo.
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      previewEmailTemplate(template.key, draft, controller.signal)
        .then((result) => {
          setPreview(result);
          setPreviewError("");
        })
        .catch((err) => {
          if (!controller.signal.aborted) setPreviewError(err instanceof Error ? err.message : "No se pudo armar la vista previa");
        });
    }, PREVIEW_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [template.key, draft]);

  const insertVariable = (name: string) => {
    const target = (document.activeElement as HTMLInputElement | HTMLTextAreaElement | null)?.id?.startsWith("tpl-")
      ? (document.activeElement as HTMLInputElement | HTMLTextAreaElement)
      : (document.getElementById("tpl-body") as HTMLTextAreaElement | null);

    if (!target) return;

    const field = target.id.replace("tpl-", "") as Field;
    const start = target.selectionStart ?? draft[field].length;
    const end = target.selectionEnd ?? start;
    const value = `${draft[field].slice(0, start)}{${name}}${draft[field].slice(end)}`;

    setDraft((current) => ({ ...current, [field]: value }));
    window.requestAnimationFrame(() => {
      target.focus();
      target.setSelectionRange(start + name.length + 2, start + name.length + 2);
    });
  };

  const run = async (action: () => Promise<void>, setBusy: (busy: boolean) => void) => {
    setBusy(true);
    setNotice(null);

    try {
      await action();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "No se pudo completar la acción" });
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      await saveEmailTemplate(template.key, draft);
      setNotice({ kind: "success", text: "Plantilla guardada. Los próximos correos la van a usar." });
      onChanged();
    }, setSaving);

  const restore = () =>
    run(async () => {
      await restoreEmailTemplate(template.key);
      setNotice({ kind: "success", text: "Se restauró el original." });
      onChanged();
    }, setSaving);

  const sendTest = () =>
    run(async () => {
      const result = await sendTestEmail(template.key, draft);
      setNotice(
        result.sent
          ? { kind: "success", text: `Correo de prueba enviado a ${result.to}.` }
          : { kind: "error", text: "No se pudo enviar el correo de prueba: revisá la configuración de correo del servidor." },
      );
    }, setSending);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{template.label}</CardTitle>
          <CardDescription>{template.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {FIELDS.map(({ name, label, max, multiline, hint }) => (
            <FormField key={name} label={label} htmlFor={`tpl-${name}`} hint={hint}>
              {multiline ? (
                <Textarea id={`tpl-${name}`} rows={9} maxLength={max} value={draft[name]} onChange={(e) => setDraft({ ...draft, [name]: e.target.value })} />
              ) : (
                <Input id={`tpl-${name}`} maxLength={max} value={draft[name]} onChange={(e) => setDraft({ ...draft, [name]: e.target.value })} />
              )}
            </FormField>
          ))}

          <div className="space-y-2">
            <p className="text-sm font-medium">Variables</p>
            <p className="text-xs text-muted-foreground">Se reemplazan por los datos reales al enviar. Tocá una para insertarla donde tenés el cursor.</p>
            <div className="flex flex-wrap gap-2">
              {template.variables.map((variable) => (
                <Button
                  key={variable.name}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="font-mono"
                  title={variable.description}
                  aria-label={`Insertar ${variable.description}`}
                  onClick={() => insertVariable(variable.name)}
                >
                  {`{${variable.name}}`}
                </Button>
              ))}
            </div>
          </div>

          {notice && <StatusAlert kind={notice.kind}>{notice.text}</StatusAlert>}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={!dirty || saving || previewError !== ""} onClick={() => void save()}>
              {saving ? <Spinner aria-label="Guardando" /> : <Save />}
              Guardar cambios
            </Button>
            <Button type="button" variant="outline" disabled={sending || previewError !== ""} onClick={() => void sendTest()}>
              {sending ? <Spinner aria-label="Enviando" /> : <Send />}
              Enviar prueba a mi correo
            </Button>
            <Button type="button" variant="ghost" disabled={!template.is_customized || saving} onClick={() => setConfirmRestore(true)}>
              <RotateCcw />
              Restaurar el original
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="self-start">
        <CardHeader>
          <CardTitle className="text-base">Vista previa</CardTitle>
          <CardDescription>Con datos de ejemplo. El enlace del botón es solo ilustrativo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {previewError ? (
            <StatusAlert kind="error">{previewError}</StatusAlert>
          ) : preview ? (
            <>
              <p className="text-sm">
                <span className="text-muted-foreground">Asunto: </span>
                <strong>{preview.subject}</strong>
              </p>
              {/* sandbox sin permisos: el correo se muestra como imagen de lo que va a llegar, sin ejecutar nada */}
              <iframe title="Vista previa del correo" sandbox="" srcDoc={preview.html} className="h-[34rem] w-full rounded-md border bg-white" />
            </>
          ) : (
            <LoadingBlock />
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Restaurar el original?</AlertDialogTitle>
            <AlertDialogDescription>Se descarta tu versión de «{template.label}» y vuelve el texto que trae el sistema.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmRestore(false);
                void restore();
              }}
            >
              Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

/** Emails: las plantillas de los correos que manda el sistema. Solo la administración del sistema. */
const EmailTemplates = () => {
  const isSystemAdmin = useSystemAdmin();
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const { data, loading, error } = useQuery(
    (signal) => (isSystemAdmin ? getEmailTemplates(signal) : Promise.resolve([] as EmailTemplate[])),
    [reload, isSystemAdmin],
    "No se pudieron cargar las plantillas",
  );

  const templates = useMemo(() => data ?? [], [data]);
  const current = templates.find((t) => t.key === selected) ?? templates[0] ?? null;

  // Mientras se consulta el rol no se muestra el aviso de "sin permiso": evita un parpadeo
  if (!isSystemAdmin) return loading ? <LoadingBlock /> : <NoPermission />;
  if (loading && !data) return <LoadingBlock />;

  return (
    <section className="space-y-6">
      <p className="text-muted-foreground">
        Los correos que manda el sistema. Podés cambiar el texto de cada uno; si algo sale mal, «Restaurar el original» vuelve a la versión del sistema.
      </p>

      {error && <StatusAlert kind="error">{error}</StatusAlert>}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Plantillas">
        {templates.map((template) => (
          <button
            key={template.key}
            type="button"
            role="tab"
            aria-selected={template.key === current?.key}
            onClick={() => {
              setSelected(template.key);
              setNotice(null);
            }}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
              template.key === current?.key ? "border-primary bg-primary/10" : "hover:bg-muted",
            )}
          >
            <Mail className="size-4" aria-hidden="true" />
            {template.label}
            {template.is_customized && <Badge variant="secondary">Personalizada</Badge>}
          </button>
        ))}
      </div>

      {current && <TemplateEditor key={`${current.key}:${JSON.stringify(current.current)}`} template={current} onChanged={() => setReload((n) => n + 1)} notice={notice} setNotice={setNotice} />}
    </section>
  );
};

export default EmailTemplates;
