import { EMPTY_DOC } from '@/modules/notes/editor/allowlist';
import {
  mockDashboardToday,
  mockInboxConvertToNote,
  mockInboxCreate,
  mockNoteCreate,
  mockNoteDelete,
  mockNoteGet,
  mockNoteList,
  mockNoteMove,
  mockNoteSave,
  mockProjectDelete,
  mockProjectGetOverview,
  mockSearch,
  mockSeedDemoData,
  mockTaskGet,
  mockTrashList,
  mockTrashRestore,
  mockNoteLinkTask,
  mockProjectList,
  mockTaskList,
  bumpNoteVersion,
} from './mock';

const doc = (text: string) =>
  JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });

beforeAll(async () => {
  await mockSeedDemoData();
});

describe('mock v0.5: notes', () => {
  it('seed có 3 Note của GGStudio; recentNotes ở Today và Overview có dữ liệu', async () => {
    const list = await mockNoteList();
    expect(list.map((n) => n.title)).toEqual(
      expect.arrayContaining([
        'Yêu cầu kỹ thuật Booking',
        'Ghi chú họp khách hàng',
        'API thanh toán',
      ]),
    );
    expect((await mockDashboardToday()).recentNotes.length).toBeGreaterThan(0);
    const gg = (await mockProjectList()).find((p) => p.name.includes('GGStudio'));
    expect((await mockProjectGetOverview(gg?.id ?? '')).recentNotes.length).toBeGreaterThan(0);
  });

  it('Note "API thanh toán" liên kết với Task "Payment API" → TaskDetail.noteIds', async () => {
    const task = (await mockTaskList()).find((t) => t.title === 'Payment API');
    const detail = await mockTaskGet(task?.id ?? '');
    expect(detail.noteIds).toHaveLength(1);
  });

  it('save: đúng version → version + 1; lệch → CONFLICT; excerpt được trích', async () => {
    const n = await mockNoteCreate({ title: 'A', contentJson: EMPTY_DOC });
    expect(n.version).toBe(1);
    const r = await mockNoteSave(n.id, 'A', doc('xin chào thế giới'), 1);
    expect(r.version).toBe(2);
    await expect(mockNoteSave(n.id, 'A', doc('x'), 1)).rejects.toMatchObject({ code: 'CONFLICT' });
    const summary = (await mockNoteList()).find((s) => s.id === n.id);
    expect(summary?.excerpt).toBe('xin chào thế giới');
    bumpNoteVersion(n.id); // "nơi khác" vừa lưu
    await expect(mockNoteSave(n.id, 'A', doc('x'), 2)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await mockNoteGet(n.id)).version).toBe(3);
  });

  it('chặn node lạ và link javascript: → VALIDATION', async () => {
    const n = await mockNoteCreate({ title: 'B' });
    const bad = JSON.stringify({ type: 'doc', content: [{ type: 'image', attrs: { src: 'x' } }] });
    await expect(mockNoteSave(n.id, 'B', bad, 1)).rejects.toMatchObject({ code: 'VALIDATION' });
    const js = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    });
    await expect(mockNoteSave(n.id, 'B', js, 1)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('tìm không dấu: "ghi chu" ra Note "Ghi chú"; xoá → Thùng rác → khôi phục', async () => {
    const n = await mockNoteCreate({ title: 'Ghi chú đặc biệt', contentJson: doc('nội dung') });
    expect((await mockSearch('ghi chu dac', ['Note'])).map((h) => h.id)).toContain(n.id);
    await mockNoteDelete(n.id);
    expect((await mockSearch('ghi chu dac', ['Note'])).map((h) => h.id)).not.toContain(n.id);
    expect((await mockTrashList()).some((i) => i.kind === 'Note' && i.id === n.id)).toBe(true);
    await mockTrashRestore('Note', n.id);
    expect((await mockNoteList()).some((s) => s.id === n.id)).toBe(true);
  });

  it('chuyển Inbox thành Note; lần hai → CONFLICT', async () => {
    const item = await mockInboxCreate('Ý tưởng: làm app ghi chú\nchi tiết thêm');
    const note = await mockInboxConvertToNote(item.id, {});
    expect(note.title).toBe('Ý tưởng: làm app ghi chú\nchi tiết thêm'.slice(0, 80));
    expect((await mockNoteGet(note.id)).contentJson).toContain('hardBreak');
    await expect(mockInboxConvertToNote(item.id, {})).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('xoá Project WithChildren xoá Note, khôi phục Project thì Note quay lại', async () => {
    const gg = (await mockProjectList()).find((p) => p.name.includes('GGStudio'));
    const id = gg?.id ?? '';
    const before = (await mockNoteList({ projectId: id })).length;
    expect(before).toBeGreaterThan(0);
    await mockProjectDelete(id, 'WithChildren');
    expect(await mockNoteList({ projectId: id })).toHaveLength(0);
    await mockTrashRestore('Project', id);
    expect(await mockNoteList({ projectId: id })).toHaveLength(before);
  });

  it('move và link task', async () => {
    const task = (await mockTaskList())[0];
    const n = await mockNoteCreate({ title: 'C' });
    await mockNoteLinkTask(n.id, task?.id ?? '');
    await mockNoteLinkTask(n.id, task?.id ?? ''); // lần hai không lỗi
    expect((await mockNoteGet(n.id)).taskIds).toEqual([task?.id]);
    const moved = await mockNoteMove(n.id, null);
    expect(moved.projectId).toBeUndefined();
  });
});
