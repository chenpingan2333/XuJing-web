"use client";

/**
 * TermsModal — 用户协议与隐私政策弹窗
 *
 * 替换真实协议文本：修改下方 TERMS_PLACEHOLDER 常量即可。
 */

const TERMS_PLACEHOLDER = `叙境 Xujing 用户协议与隐私政策

一、服务说明
叙境（以下简称"本平台"）是一个 AI 恋爱陪伴平台，提供虚拟角色聊天、角色创建与管理等服务。

二、用户注册与账户安全
1. 用户在注册时应提供真实、准确的电子邮箱地址。
2. 用户应妥善保管账户密码，因密码泄露导致的损失由用户自行承担。
3. 每个邮箱地址仅允许注册一个账户。

三、用户行为规范
1. 用户不得利用本平台从事任何违法活动。
2. 用户不得上传、发布任何违法、淫秽、暴力、骚扰、诽谤或其他不当内容。
3. 用户不得对平台系统进行反向工程、破解或任何形式的攻击。
4. 用户不得使用自动化工具（脚本、机器人等）批量注册账户或发送请求。

四、星钻与虚拟资产
1. 星钻是本平台的虚拟资产，可用于解锁特定功能。
2. 星钻不可兑换为真实货币，不可转让，不可退款。
3. 平台保留对星钻获取与消耗规则进行调整的权利。

五、隐私政策
1. 本平台收集用户的邮箱地址用于账户识别与登录验证。
2. 用户的聊天记录存储于平台服务器，用于提供 AI 对话服务。
3. 本平台不会向第三方出售或分享用户的个人信息。
4. 用户有权随时请求删除其账户及所有关联数据。

六、免责声明
1. AI 角色生成的所有回复均由人工智能模型自动产生，不代表平台立场。
2. 本平台不对 AI 回复的准确性、适当性或完整性作任何保证。
3. 本平台保留随时修改或终止服务的权利，恕不另行通知。

七、知识产权
本平台的所有代码、设计、logo 及原创内容的知识产权归平台所有。

八、法律适用
本协议受中华人民共和国法律管辖。因本协议产生的争议，双方应友好协商解决。

如对本协议有任何疑问，请联系：support@xujing.modelbridge.top

最后更新日期：2026 年 6 月 9 日`;

interface TermsModalProps {
  open: boolean;
  onAgree: () => void;
  onDisagree: () => void;
}

export default function TermsModal({ open, onAgree, onDisagree }: TermsModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
      onClick={onDisagree}
    >
      <div
        className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-3 flex-shrink-0">
          <h2 className="text-sm font-semibold text-neutral-200">用户协议与隐私政策</h2>
          <button
            onClick={onDisagree}
            className="text-neutral-500 hover:text-neutral-300 transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Content — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 pb-2">
          <div className="text-xs text-neutral-400 leading-relaxed whitespace-pre-wrap select-none">
            {TERMS_PLACEHOLDER}
          </div>
        </div>

        {/* Gradient fade at bottom of scroll area */}
        <div className="h-6 bg-gradient-to-t from-neutral-900 to-transparent flex-shrink-0 -mt-6 relative z-10 pointer-events-none" />

        {/* Buttons */}
        <div className="flex items-center gap-3 px-6 py-5 flex-shrink-0">
          <button
            onClick={onDisagree}
            className="flex-1 rounded-xl border border-neutral-700 py-2.5 text-sm font-medium text-neutral-400 hover:border-neutral-500 hover:text-neutral-300 transition-colors"
          >
            不同意
          </button>
          <button
            onClick={onAgree}
            className="flex-1 rounded-xl bg-neutral-100 py-2.5 text-sm font-medium text-neutral-900 hover:bg-white transition-colors"
          >
            同意并继续
          </button>
        </div>
      </div>
    </div>
  );
}
