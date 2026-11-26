import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useT, type TKey } from '@/lib/i18n';
import type { Project, ProjectStatus } from '@/lib/ipc/contract';
import { DraftField, Field, OptionalDate } from '@/modules/tasks/TaskDetailPanel';
import { useAreas, useDateCtx } from '@/modules/tasks/hooks';
import { AppearancePicker } from './AppearancePicker';
import { useUpdateProject } from './hooks';
import { RetireProjectDialog } from './ProjectDialogs';

const NO_AREA = '__none';
const STATUS_LIST: ProjectStatus[] = ['Planned', 'Active', 'OnHold', 'Completed'];

/** Sửa đủ các trường của `ProjectPatch` + vùng nguy hiểm (lưu trữ, xoá). */
export function ProjectSettingsTab({ project }: { project: Project }) {
  const t = useT();
  const ctx = useDateCtx();
  const navigate = useNavigate();
  const { data: areas = [] } = useAreas();
  const update = useUpdateProject(project);
  const [retire, setRetire] = useState<'archive' | 'delete' | null>(null);
  const leave = () => void navigate('/today');

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="space-y-4">
        <DraftField
          id="ps-name"
          label={t('proj.nameLabel')}
          value={project.name}
          onCommit={(name) => name.trim() && update.mutate({ name })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field id="ps-status" label={t('proj.status')}>
            <Select
              value={project.status}
              onValueChange={(v) => update.mutate({ status: v as ProjectStatus })}
            >
              <SelectTrigger id="ps-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_LIST.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`proj.status.${s}` as TKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="ps-area" label={t('proj.area')}>
            <Select
              value={project.areaId ?? NO_AREA}
              onValueChange={(v) => update.mutate({ areaId: v === NO_AREA ? null : v })}
            >
              <SelectTrigger id="ps-area" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_AREA}>{t('detail.noArea')}</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="ps-start" label={t('proj.startDate')}>
            <OptionalDate
              value={project.startDate}
              onChange={(startDate) => update.mutate({ startDate })}
              ctx={ctx}
              label={t('proj.startDate')}
            />
          </Field>
          <Field id="ps-target" label={t('proj.targetDate')}>
            <OptionalDate
              value={project.targetDate}
              onChange={(targetDate) => update.mutate({ targetDate })}
              ctx={ctx}
              label={t('proj.targetDate')}
            />
          </Field>
        </div>
        <DraftField
          id="ps-desc"
          label={t('proj.description')}
          value={project.description}
          multiline
          onCommit={(description) => update.mutate({ description })}
        />
        <AppearancePicker
          color={project.color}
          icon={project.icon}
          onColor={(color) => update.mutate({ color: color ?? null })}
          onIcon={(icon) => update.mutate({ icon: icon ?? null })}
        />
      </Card>

      <Card className="space-y-3 border-danger/60">
        <CardTitle>{t('proj.danger')}</CardTitle>
        <p className="text-muted">{t('proj.dangerHint')}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setRetire('archive')}>
            {t('proj.archive')}
          </Button>
          <Button variant="danger" onClick={() => setRetire('delete')}>
            {t('proj.delete')}
          </Button>
        </div>
      </Card>

      <RetireProjectDialog
        project={retire ? project : null}
        kind={retire ?? 'archive'}
        onClose={() => setRetire(null)}
        onDone={leave}
      />
    </div>
  );
}
