import {
  mockDashboardToday,
  mockProjectArchive,
  mockProjectDelete,
  mockProjectGetOverview,
  mockProjectList,
  mockProjectUnarchive,
  mockSeedDemoData,
  mockTaskList,
  mockTrashList,
  mockTrashRestore,
} from './mock';

describe('mock v0.3', () => {
  it('dữ liệu mẫu: GGStudio 26/40 (65%), nạp lần hai báo CONFLICT', async () => {
    await mockSeedDemoData();
    const list = await mockProjectList();
    const gg = list.find((p) => p.name.startsWith('GGStudio'));
    expect(gg).toBeDefined();
    const ov = await mockProjectGetOverview(gg?.id ?? '');
    expect(ov.progress).toMatchObject({ done: 26, total: 40, percent: 65 });
    expect(ov.counts).toMatchObject({ done: 26, inProgress: 2 });
    await expect(mockSeedDemoData()).rejects.toMatchObject({ code: 'CONFLICT' });
    const today = await mockDashboardToday();
    expect(today.overdue.length).toBeGreaterThanOrEqual(2);
    expect(today.today.length).toBeGreaterThanOrEqual(3);
    expect(today.activeProjects.map((p) => p.name)).toContain('Đồ án tốt nghiệp');
  });

  it('archive WithChildren rồi unarchive khôi phục đúng các Task cùng mốc', async () => {
    const thesis = (await mockProjectList()).find((p) => p.name === 'Đồ án tốt nghiệp');
    const id = thesis?.id ?? '';
    await mockProjectArchive(id, 'WithChildren');
    expect((await mockProjectList()).some((p) => p.id === id)).toBe(false);
    expect((await mockProjectList(true)).some((p) => p.id === id)).toBe(true);
    expect(await mockTaskList({ projectId: id })).toHaveLength(0);
    await mockProjectUnarchive(id);
    expect(await mockTaskList({ projectId: id })).toHaveLength(6);
  });

  it('delete Detach giữ Task độc lập; delete WithChildren vào Trash và khôi phục được', async () => {
    const gg = (await mockProjectList()).find((p) => p.name.startsWith('GGStudio'));
    const id = gg?.id ?? '';
    await mockProjectDelete(id, 'WithChildren');
    const trash = await mockTrashList();
    expect(trash.filter((i) => i.kind === 'Project')).toHaveLength(1);
    expect(trash.filter((i) => i.kind === 'Task' && i.title === 'Booking system')).toHaveLength(0);
    await mockTrashRestore('Project', id);
    const ov = await mockProjectGetOverview(id);
    expect(ov.progress.total).toBe(40);
  });
});
