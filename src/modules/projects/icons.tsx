import {
  BookOpen,
  Briefcase,
  Camera,
  Code,
  Folder,
  Gamepad2,
  Globe,
  GraduationCap,
  Heart,
  House,
  Leaf,
  Music,
  Rocket,
  Star,
  Target,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** 16 icon lucide định sẵn cho Project (tên lưu trong `Project.icon`). */
export const PROJECT_ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  briefcase: Briefcase,
  'gamepad-2': Gamepad2,
  'graduation-cap': GraduationCap,
  code: Code,
  book: BookOpen,
  heart: Heart,
  home: House,
  rocket: Rocket,
  star: Star,
  target: Target,
  wrench: Wrench,
  music: Music,
  camera: Camera,
  globe: Globe,
  leaf: Leaf,
};

export const PROJECT_ICON_NAMES = Object.keys(PROJECT_ICONS);

/** Icon + màu của Project; chưa chọn icon thì dùng chấm màu. */
export function ProjectIcon({
  icon,
  color,
  className,
}: {
  icon?: string | undefined;
  color?: string | undefined;
  className?: string;
}) {
  const Icon = icon ? PROJECT_ICONS[icon] : undefined;
  if (!Icon)
    return (
      <span
        aria-hidden
        className={cn('inline-block size-3 shrink-0 rounded-full border border-border', className)}
        style={{ background: color ?? 'transparent' }}
      />
    );
  return <Icon aria-hidden className={cn('size-4 shrink-0', className)} style={{ color }} />;
}
