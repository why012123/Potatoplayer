import { useEffect, useState } from "react";
import { Check, KeyRound, LoaderCircle, PlugZap, X } from "lucide-react";
import { Modal } from "@/components/Modal";
import { useAssistant, refreshAssistantConnection, type ConnectionStatus } from "./assistant";
export function AiConnection() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("deepseek-flash");
  const [enabled, setEnabled] = useState(true);
  const [webSearch, setWebSearch] = useState(true);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    void refreshAssistantConnection();
    const show = () => { setOpen(true); setKey(""); setNotice(""); void window.potato.invoke<ConnectionStatus>("ai.status").then((s) => { setStatus(s);setModel(s.model);setEnabled(s.enabled || !s.hasKey);setWebSearch(s.webSearchEnabled !== false); }).catch((e) => setNotice(String(e))); };
    window.addEventListener("potato:ai-settings", show);
    return () => window.removeEventListener("potato:ai-settings", show);
  }, []);
  const save = async (test = false) => {
    setPending(true);setNotice("");
    try {
      if (enabled && !key.trim() && !status?.hasKey) throw Error("请先填写 DeepSeek API Key。");
      const next = await window.potato.invoke<ConnectionStatus>("ai.configure", { enabled, model, webSearchEnabled: webSearch, ...(key.trim() ? { apiKey: key.trim() } : {}) });
      setStatus(next);setKey("");await refreshAssistantConnection();
      if(test) { const result=await window.potato.invoke<{models:string[]}>("ai.test");setNotice(result.models.includes(model)?"连接成功，当前模型可用。":`连接成功，但模型列表未包含 ${model}，请检查名称。`); }
      else setNotice(next.storage === "session" ? "已启用。本机加密不可用，密钥仅保留到本次退出。" : "连接设置已保存。");
    } catch(e) {setNotice(e instanceof Error?e.message:String(e));} finally {setPending(false);}
  };
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>(".ai-connection-modal");
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? []);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); if (!pending) setOpen(false); }
      if (event.key === "Tab") {
        const items = focusable(); const first = items[0]; const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); previous?.focus(); };
  }, [open, pending]);
  if(!open) return null;
  return <Modal onClose={() => {if(!pending)setOpen(false);}} labelledBy="ai-connection-title" className="ai-connection-modal"><button className="ai-config-close" aria-label="关闭 AI 连接设置" disabled={pending} onClick={() => setOpen(false)}><X size={18}/></button><div className="modal__eyebrow"><PlugZap size={14}/> DEEPSEEK CONNECTION</div><h2 id="ai-connection-title">让音乐助手，真正懂你。</h2><p className="modal__description">连接 DeepSeek 后，可以聊天、找歌、管理资料与歌单、联网查歌曲资料、搜索下载网易云歌曲，以及调整外观。</p><label className="ai-connection-enable"><input type="checkbox" checked={enabled} disabled={pending} onChange={(e)=>setEnabled(e.target.checked)}/>启用 DeepSeek <small>关闭时使用本地匹配</small></label><label className="ai-connection-enable ai-connection-web"><input type="checkbox" checked={webSearch} disabled={pending || !enabled} onChange={(e)=>setWebSearch(e.target.checked)}/>联网搜索 <small>使用 DeepSeek Search / Fetch，按成功请求计费</small></label><label className="ai-config-field">模型名称<input list="ai-models" value={model} disabled={pending} onChange={e=>setModel(e.target.value)} spellCheck={false}/><datalist id="ai-models"><option value="deepseek-flash"/><option value="deepseek-v4-pro"/></datalist></label><label className="ai-config-field">API Key <span>{status?.hasKey ? "已配置 · 留空保留" : "尚未配置"}</span><input type="password" autoComplete="off" aria-label="DeepSeek API Key" value={key} disabled={pending} onChange={e=>setKey(e.target.value)} placeholder="sk-…" spellCheck={false}/></label><p className="ai-config-note"><KeyRound size={13}/>密钥由桌面端加密保存，不进入聊天内容。连接后，你的消息和工具所需的歌曲信息会发送至 DeepSeek，并按你的 API 账户计费。</p><div className="ai-config-capabilities"><span>歌曲资料编辑</span><span>播放与歌单</span><span>联网查资料</span><span>长期记忆</span><span>网易云搜索下载</span><span>外观设置</span></div>{notice && <p role="status" className="ai-config-notice">{notice}</p>}<div className="ai-config-actions"><button disabled={pending || !status?.hasKey} onClick={async()=>{setPending(true);try {setStatus(await window.potato.invoke<ConnectionStatus>("ai.configure",{clearKey:true,enabled:false}));setEnabled(false);await refreshAssistantConnection();setNotice("已清除保存的密钥；环境变量密钥不受影响。");}catch(e){setNotice(String(e));}finally{setPending(false);}}}>清除密钥</button><button disabled={pending} onClick={()=>void save(true)}>{pending?<LoaderCircle size={14}/>:<PlugZap size={14}/>}保存并测试</button><button disabled={pending} className="ai-primary" onClick={()=>void save()}>保存设置</button></div></Modal>;
}
