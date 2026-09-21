import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/controls';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useConfirm } from '@/lib/use-confirm';
import { useState, useRef, useCallback, useEffect } from 'react';
import { captureChatPhone } from '@/lib/capture-chat';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, Copy, Download, FolderOpen, History, Image as ImageIcon, LayoutGrid, MessageSquare, Settings2, ShieldCheck, UsersRound } from 'lucide-react';
import { ImportPanel } from '@/components/ImportPanel';
import { UserAvatarManager } from '@/components/UserAvatarManager';
import { MessageEditor } from '@/components/MessageEditor';
import { SettingsPanel } from '@/components/SettingsPanel';
import { PhonePreview } from '@/components/PhonePreview';
import { GrowthContent } from '@/components/GrowthContent';
import { ProjectPanel } from '@/components/ProjectPanel';
import { MomentsEditor } from '@/components/MomentsEditor';
import { WechatSceneEditor } from '@/components/WechatSceneEditor';
import { BatchStudio } from '@/components/BatchStudio';
import { ExportLogPage } from '@/components/ExportLogPage';
import { beginExportLog, exportLogError } from '@/lib/export-log';
import { newId } from '@/lib/uid';
import { WorkspacePanels } from '@/components/WorkspacePanels';
import { StudioLink, ToolHome } from '@/components/ToolHome';
import { workspaceTools } from '@/lib/workspace-tools';
import { readWorkspaceRoute, workspaceHref, type WorkspaceRoute } from '@/lib/workspace-route';
import { parseChatRecord } from '@/lib/parser';
import {
  activeProjectStorageKey,
  copyProject,
  deleteProject,
  listProjects,
  projectHasContent,
  projectName,
  saveProject,
  type ChatProject,
  type ChatProjectSnapshot,
} from '@/lib/project-store';
import type { ChatUser, ChatMessage, PhoneSettings, WechatTool } from '@/types';

const defaultSettings: PhoneSettings = {
  platform: 'ios',
  time: '12:02',
  signal: 4,
  secondarySignal: 3,
  simMode: 'single',
  wifiEnabled: true,
  battery: 60,
  contactName: '',
  unreadCount: 1,
  selfBubbleColor: '#95ec69',
  otherBubbleColor: '#ffffff',
  backgroundColor: '#ededed',
  backgroundImage: null,
};

function App() {
  const [route, setRoute] = useState<WorkspaceRoute>(() => readWorkspaceRoute(window.location.href));
  const isWorking = route !== 'home' && route !== 'resources' && route !== 'exports';
  const activeTool: WechatTool = isWorking ? route : 'chat';
  const { request: confirmation, confirm, resolve: resolveConfirmation } = useConfirm();
  const [chatSection, setChatSection] = useState<'content' | 'people' | 'settings' | 'projects'>('content');
  const navigate = useCallback((next: WorkspaceRoute) => {
    window.history.pushState(null, '', workspaceHref(next, window.location.href));
    setRoute(next);
  }, []);
  useEffect(() => {
    const syncRoute = () => setRoute(readWorkspaceRoute(window.location.href));
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => { window.removeEventListener('popstate', syncRoute); window.removeEventListener('hashchange', syncRoute); };
  }, []);
  useEffect(() => {
    // Each independently addressable work page gets its own browser-tab title.
    const title = workspaceTools.find(tool => tool.id === route)?.title || (route === 'exports' ? '导出日志' : route === 'resources' ? '模板与指南' : '工具概览');
    document.title = `${title} · 微信创作工具箱`;
  }, [route]);
  const [importText, setImportText] = useState('');
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [settings, setSettings] = useState<PhoneSettings>(defaultSettings);
  const [selfId, setSelfId] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const [projects, setProjects] = useState<ChatProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProjectName, setActiveProjectName] = useState('');
  const [activeProjectCreatedAt, setActiveProjectCreatedAt] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const phoneRef = useRef<HTMLDivElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const skipNextSave = useRef(false);

  useEffect(() => {
    if (!isWorking) return;
    try {
      localStorage.setItem('wechat-dialog-generator:active-tool', activeTool);
    } catch {
      // Tool switching still works for the current page session.
    }
  }, [activeTool, isWorking]);

  useEffect(() => {
    let cancelled = false;

    async function restoreWorkspace() {
      if (!('indexedDB' in window)) {
        setStorageAvailable(false);
        setStorageReady(true);
        return;
      }
      try {
        const storedProjects = await listProjects();
        if (cancelled) return;
        setProjects(storedProjects);

        let storedId: string | null = null;
        try {
          storedId = localStorage.getItem(activeProjectStorageKey);
        } catch {
          storedId = null;
        }
        const active = storedProjects.find(project => project.id === storedId);
        if (active) {
          skipNextSave.current = true;
          setImportText(active.importText);
          setUsers(active.users);
          setMessages(active.messages);
          setSettings({ ...defaultSettings, ...active.settings });
          setSelfId(active.selfId);
          setActiveProjectId(active.id);
          setActiveProjectName(active.name);
          setActiveProjectCreatedAt(active.createdAt);
          setSaveState('saved');
        }
      } catch {
        if (!cancelled) {
          setStorageAvailable(false);
          setSaveState('error');
        }
      } finally {
        if (!cancelled) setStorageReady(true);
      }
    }

    void restoreWorkspace();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!storageReady || !storageAvailable) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    const snapshot: ChatProjectSnapshot = { importText, users, messages, settings, selfId };
    if (!projectHasContent(snapshot)) return;

    setSaveState('saving');
    const timer = window.setTimeout(() => {
      const now = new Date().toISOString();
      const isNewProject = activeProjectId === null;
      const id = activeProjectId ?? newId();
      const name = activeProjectName.trim() || projectName(snapshot);
      const project: ChatProject = {
        ...snapshot,
        id,
        name,
        createdAt: activeProjectCreatedAt ?? now,
        updatedAt: now,
        version: 1,
      };

      void saveProject(project).then(() => {
        if (isNewProject) skipNextSave.current = true;
        setActiveProjectId(id);
        setActiveProjectName(name);
        setActiveProjectCreatedAt(project.createdAt);
        setProjects(current => [project, ...current.filter(item => item.id !== id)]);
        setSaveState('saved');
        try {
          localStorage.setItem(activeProjectStorageKey, id);
        } catch {
          // IndexedDB remains the source of truth when localStorage is unavailable.
        }
      }).catch(() => {
        setStorageAvailable(false);
        setSaveState('error');
      });
    }, 700);

    return () => window.clearTimeout(timer);
  }, [
    activeProjectCreatedAt,
    activeProjectId,
    activeProjectName,
    importText,
    messages,
    selfId,
    settings,
    storageAvailable,
    storageReady,
    users,
  ]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2500);
  }, []);

  useEffect(() => {
    const warn = () => showToast('导出日志保存失败，不影响本次导出；请检查浏览器存储权限或剩余空间。');
    window.addEventListener(exportLogError, warn);
    return () => window.removeEventListener(exportLogError, warn);
  }, [showToast]);

  const persistCurrentProject = useCallback(async () => {
    if (!storageAvailable) return;
    const snapshot: ChatProjectSnapshot = { importText, users, messages, settings, selfId };
    if (!projectHasContent(snapshot)) return;
    const now = new Date().toISOString();
    const id = activeProjectId ?? newId();
    const project: ChatProject = {
      ...snapshot,
      id,
      name: activeProjectName.trim() || projectName(snapshot),
      createdAt: activeProjectCreatedAt ?? now,
      updatedAt: now,
      version: 1,
    };
    await saveProject(project);
    setProjects(current => [project, ...current.filter(item => item.id !== id)]);
  }, [
    activeProjectCreatedAt,
    activeProjectId,
    activeProjectName,
    importText,
    messages,
    selfId,
    settings,
    storageAvailable,
    users,
  ]);

  const resetEditor = useCallback(() => {
    skipNextSave.current = true;
    setImportText('');
    setUsers([]);
    setMessages([]);
    setSettings(defaultSettings);
    setSelfId(null);
    setActiveProjectId(null);
    setActiveProjectName('');
    setActiveProjectCreatedAt(null);
    setSaveState('idle');
    try {
      localStorage.removeItem(activeProjectStorageKey);
    } catch {
      // The editor can still start a new in-memory project.
    }
  }, []);

  const handleCreateProject = useCallback(async () => {
    try {
      await persistCurrentProject();
      resetEditor();
      showToast('已新建空白对话，上一份内容已自动保存');
    } catch {
      showToast('保存当前项目失败，请稍后重试');
    }
  }, [persistCurrentProject, resetEditor, showToast]);

  const handleOpenProject = useCallback(async (project: ChatProject) => {
    if (project.id === activeProjectId) return;
    try {
      await persistCurrentProject();
    } catch {
      showToast('当前项目保存失败，暂未切换');
      return;
    }
    skipNextSave.current = true;
    setImportText(project.importText);
    setUsers(project.users);
    setMessages(project.messages);
    setSettings({ ...defaultSettings, ...project.settings });
    setSelfId(project.selfId);
    setActiveProjectId(project.id);
    setActiveProjectName(project.name);
    setActiveProjectCreatedAt(project.createdAt);
    setSaveState('saved');
    try {
      localStorage.setItem(activeProjectStorageKey, project.id);
    } catch {
      // Project switching still works for the current page session.
    }
    showToast(`已打开“${project.name}”`);
  }, [activeProjectId, persistCurrentProject, showToast]);

  const handleDuplicateProject = useCallback(async (source: ChatProject) => {
    try {
      const duplicate = copyProject(source);
      await saveProject(duplicate);
      setProjects(current => [duplicate, ...current]);
      showToast(`已复制“${source.name}”`);
    } catch {
      showToast('复制项目失败');
    }
  }, [showToast]);

  const handleDeleteProject = useCallback(async (project: ChatProject) => {
    if (!await confirm({ title: '删除本地草稿？', description: `确定删除“${project.name}”吗？此操作无法撤销。`, confirmText: '删除草稿' })) return;
    try {
      await deleteProject(project.id);
      setProjects(current => current.filter(item => item.id !== project.id));
      if (project.id === activeProjectId) resetEditor();
      showToast('项目已从本机删除');
    } catch {
      showToast('删除项目失败');
    }
  }, [activeProjectId, confirm, resetEditor, showToast]);

  const handleUseTemplate = useCallback((content: string) => {
    setImportText(content);
    navigate('chat');
    setChatSection('content');
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('模板已载入，点击“解析并导入”即可预览');
  }, [showToast, navigate]);

  const handleImport = useCallback(() => {
    if (!importText.trim()) {
      showToast('请先输入聊天记录文本');
      return;
    }
    const result = parseChatRecord(importText);
    if (result.messages.length === 0) {
      showToast('未解析到任何消息');
      return;
    }
    setUsers(result.users);
    setMessages(result.messages);
    setSelfId(result.users[0]?.id ?? null);
    if (result.users.length >= 3) {
      const otherNames = result.users.slice(1).map(u => u.name);
      const nameStr = result.users.length <= 4
        ? otherNames.join('、')
        : otherNames.slice(0, 2).join('、') + '等';
      setSettings(s => ({ ...s, contactName: nameStr + '(' + result.users.length + ')' }));
    } else if (result.users.length === 2) {
      setSettings(s => ({ ...s, contactName: result.users[1].name }));
    } else if (result.users.length === 1) {
      setSettings(s => ({ ...s, contactName: result.users[0].name }));
    }
    showToast(`成功导入 ${result.messages.length} 条消息（${result.users.length} 个用户）`);
  }, [importText, showToast]);

  const handleUpdateAvatar = useCallback((userId: number, avatar: string) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, avatar } : u));
  }, []);

  const handleRemoveAvatar = useCallback((userId: number) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, avatar: null } : u));
  }, []);

  const handleUpdateMessage = useCallback((msgId: number, content: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content } : m));
  }, []);

  const handleAddMessage = useCallback((msg: Omit<ChatMessage, 'id'>) => {
    setMessages(prev => {
      const maxId = prev.reduce((max, m) => Math.max(max, m.id), 0);
      return [...prev, { ...msg, id: maxId + 1 }];
    });
  }, []);

  const capturePhone = useCallback(async (longshot = false) => {
    return phoneRef.current ? captureChatPhone(phoneRef.current, longshot) : null;
  }, []);

  const handleGenerateImage = useCallback(async () => {
    if (!phoneRef.current) return;
    const filename = '微信聊天记录_' + Date.now() + '.png';
    const log = beginExportLog({ tool: 'chat', mode: 'standard', filename });
    showToast('正在生成图片...');
    try {
      const canvas = await capturePhone(false);
      if (!canvas) { void log.finish('failed', '未能获取聊天预览'); return; }
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
      void log.finish('download_requested');
      showToast('图片已生成并下载！');
    } catch (e: unknown) {
      void log.finish('failed', '图片生成或下载操作失败');
      showToast('生成失败：' + (e instanceof Error ? e.message : String(e)));
    }
  }, [showToast, capturePhone]);

  const handleCopyImage = useCallback(async () => {
    if (!phoneRef.current) return;
    const log = beginExportLog({ tool: 'chat', mode: 'clipboard' });
    showToast('正在生成图片...');
    try {
      const canvas = await capturePhone(false);
      if (!canvas) { void log.finish('failed', '未能获取聊天预览'); return; }
      canvas.toBlob(async (blob) => {
        if (!blob) { void log.finish('failed', '图片转换失败'); return; }
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          void log.finish('copied');
          showToast('图片已复制到剪贴板！');
        } catch {
          void log.finish('failed', '图片复制失败，请检查剪贴板权限');
          showToast('复制失败，请使用下载功能');
        }
      });
    } catch {
      void log.finish('failed', '图片生成失败');
      showToast('操作失败');
    }
  }, [showToast, capturePhone]);

  const handleGenerateLongImage = useCallback(async () => {
    if (!phoneRef.current) return;
    const filename = '微信聊天记录_长截图_' + Date.now() + '.png';
    const log = beginExportLog({ tool: 'chat', mode: 'long', filename });
    showToast('正在生成长截图...');
    try {
      const canvas = await capturePhone(true);
      if (!canvas) { void log.finish('failed', '未能获取聊天预览'); return; }
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
      void log.finish('download_requested');
      showToast('长截图已生成并下载！');
    } catch (e: unknown) {
      void log.finish('failed', '长图生成或下载操作失败');
      showToast('生成失败：' + (e instanceof Error ? e.message : String(e)));
    }
  }, [showToast, capturePhone]);

  const hasMessages = messages.length > 0;

  return (
    <>
      <div className={`studio-app ${isWorking ? 'is-working' : ''}`}>
        <header className="studio-header">
          <StudioLink route="home" onNavigate={navigate} className="studio-brand"><span><MessageSquare size={19} /></span><strong>微信创作工具箱</strong></StudioLink>
          <div className="studio-breadcrumb"><span>/</span><span>{isWorking ? '工作空间' : '创作中心'}</span><ChevronRight size={14} /><b>{workspaceTools.find(tool => tool.id === route)?.title || (route === 'exports' ? '导出日志' : route === 'resources' ? '模板与指南' : '工具概览')}</b></div>
        </header>
        <div className="studio-layout">
          <aside className="studio-sidebar" aria-label="工作空间导航">
            <StudioLink route="home" onNavigate={navigate} aria-label="工具概览" title="工具概览" className={`studio-overview-link ${route === 'home' ? 'is-active' : ''}`} aria-current={route === 'home' ? 'page' : undefined}><LayoutGrid size={17} /><span>工具概览</span></StudioLink>
            <div className="studio-nav-label">创作工具 <span>07</span></div>
            <nav className="studio-tool-nav" aria-label="微信创作工具箱">{workspaceTools.map(tool => <StudioLink key={tool.id} route={tool.id} onNavigate={navigate} className={route === tool.id ? 'is-active' : ''} aria-label={tool.title} title={tool.title} aria-current={route === tool.id ? 'page' : undefined}><tool.icon size={17} /><span>{tool.title}</span>{tool.id === 'batch' && <small>批量</small>}</StudioLink>)}</nav>
            <StudioLink route="exports" onNavigate={navigate} aria-label="导出日志" title="导出日志" className={`studio-overview-link ${route === 'exports' ? 'is-active' : ''}`} aria-current={route === 'exports' ? 'page' : undefined}><History size={17} /><span>导出日志</span></StudioLink>
            <div className="studio-sidebar-bottom">
              <StudioLink route="resources" onNavigate={navigate} aria-label="模板与指南" title="模板与指南" className={`studio-overview-link ${route === 'resources' ? 'is-active' : ''}`} aria-current={route === 'resources' ? 'page' : undefined}><BookOpen size={17} /> 模板与指南</StudioLink>
              <p className="studio-sidebar-note"><ShieldCheck size={13} /> 纯本地处理 · 无需联网</p>
            </div>
          </aside>
          <div className="studio-stage">
            {route === 'exports' && <ExportLogPage onNavigate={navigate} />}
            {route === 'home' && <div className="studio-page-scroll"><ToolHome onNavigate={navigate} hasDraft={hasMessages} /></div>}
            {route === 'resources' && <main className="studio-page-scroll studio-resources"><StudioLink route="home" onNavigate={navigate} className="studio-back-link"><ArrowLeft size={15} /> 返回工具概览</StudioLink><h1>模板与使用指南</h1><p className="studio-page-description">挑选一个示例，在独立工作页中继续编辑。</p><GrowthContent onUseTemplate={handleUseTemplate} onOpenEditor={() => { setChatSection('content'); navigate('chat'); }} /><footer className="analytics-note">全部内容与图片都在本地浏览器处理，不发送任何服务器请求。</footer></main>}
            {isWorking && <h1 className="studio-work-title sr-only">{workspaceTools.find(tool => tool.id === activeTool)?.title}</h1>}
            <div className="studio-tool-page" hidden={route !== 'batch'}><BatchStudio currentChat={{ users, messages, settings, selfId }} /></div>
            <div className="studio-tool-page" hidden={route !== 'chat'} id="editor" ref={editorRef}>
              <WorkspacePanels previewTitle="聊天效果预览" previewDescription="可滚动查看消息 · 导出宽度 1125px" preview={<PhonePreview users={users} messages={messages} settings={settings} selfId={selfId} phoneRef={phoneRef} onUpdateMessage={handleUpdateMessage} />}
                previewActions={<div className="chat-export-actions"><div className="chat-export-summary"><span>{messages.length} 条消息 · {users.length} 个角色</span><span>本地导出</span></div><Button type="button" className="btn btn-primary chat-export-primary" disabled={!hasMessages} onClick={handleGenerateImage}><Download size={16} /> 生成图片</Button><div className="chat-export-secondary"><Button type="button" className="btn btn-outline" disabled={!hasMessages} onClick={handleGenerateLongImage}><ImageIcon size={15} /> 长截图</Button><Button type="button" className="btn btn-outline" disabled={!hasMessages} onClick={handleCopyImage}><Copy size={15} /> 复制</Button></div></div>}>
                <div className="chat-project-bar"><label><span>当前对话</span><Input aria-label="工作页项目名称" placeholder="未命名对话" value={activeProjectName} maxLength={48} onChange={event => setActiveProjectName(event.target.value)} /></label><span className={`studio-save-state is-${saveState}`}>{saveState === 'saved' ? <><Check size={13} /> 已自动保存</> : saveState === 'saving' ? '保存中…' : saveState === 'error' ? '本地保存失败' : '仅保存在本机'}</span></div>
                <Tabs value={chatSection} onValueChange={value => setChatSection(value as typeof chatSection)}>
                  <TabsList variant="line" className="studio-section-tabs" aria-label="聊天编辑面板">{([{ id: 'content', label: '聊天内容', icon: MessageSquare }, { id: 'people', label: '角色头像', icon: UsersRound }, { id: 'settings', label: '手机样式', icon: Settings2 }, { id: 'projects', label: '本地草稿', icon: FolderOpen }] as const).map(item => <TabsTrigger key={item.id} value={item.id}><item.icon size={15} />{item.label}</TabsTrigger>)}</TabsList>
                  <TabsContent className="chat-section-content" value="content" keepMounted>
                    <ImportPanel text={importText} onTextChange={setImportText} onImport={handleImport} />
                    {users.length > 0 && <MessageEditor users={users} selfId={selfId} onAddMessage={handleAddMessage} />}
                    {!hasMessages && <div className="workspace-getting-started"><span>第一次使用？</span><p>按“姓名：消息”逐行输入，点击解析即可预览。也可以从模板开始。</p><StudioLink route="resources" onNavigate={navigate}>选择对话模板 <ArrowRight size={14} /></StudioLink></div>}
                  </TabsContent>
                  <TabsContent className="chat-section-content" value="people" keepMounted>{users.length ? <UserAvatarManager users={users} selfId={selfId} onUpdateAvatar={handleUpdateAvatar} onRemoveAvatar={handleRemoveAvatar} onSetSelf={setSelfId} /> : <div className="workspace-empty"><UsersRound size={30} /><h2>先添加聊天角色</h2><p>导入对话后，即可在这里设置头像和“我”的身份。</p><Button type="button" className="btn btn-outline" onClick={() => setChatSection('content')}>编辑聊天内容</Button></div>}</TabsContent>
                  <TabsContent className="chat-section-content" value="settings" keepMounted><SettingsPanel settings={settings} onSettingsChange={setSettings} /></TabsContent>
                  <TabsContent className="chat-section-content" value="projects" keepMounted><ProjectPanel projects={projects} activeProjectId={activeProjectId} activeProjectName={activeProjectName} saveState={saveState} storageAvailable={storageAvailable} onCreate={() => { void handleCreateProject().then(() => setChatSection('content')); }} onOpen={project => { void handleOpenProject(project).then(() => setChatSection('content')); }} onRename={setActiveProjectName} onDuplicate={project => { void handleDuplicateProject(project); }} onDelete={project => { void handleDeleteProject(project); }} />{!projects.length && <p className="workspace-muted">暂无本地草稿。开始编辑后会自动保存到当前浏览器。</p>}</TabsContent>
                </Tabs>
              </WorkspacePanels>
            </div>
            <div className="studio-tool-page" hidden={route !== 'moments'}><MomentsEditor onToast={showToast} /></div>
            {(['payment', 'redpacket', 'profile', 'group'] as const).map(kind => <div className="studio-tool-page" key={kind} hidden={route !== kind}><WechatSceneEditor kind={kind} onToast={showToast} /></div>)}
          </div>
        </div>
      </div>

      <ConfirmDialog open={Boolean(confirmation)} title={confirmation?.title ?? ""} description={confirmation?.description ?? ""} confirmText={confirmation?.confirmText} onOpenChange={open => { if (!open) resolveConfirmation(false); }} onConfirm={() => resolveConfirmation(true)} />
      {toast && <div className="toast-msg">{toast}</div>}
    </>
  );
}

export default App;
