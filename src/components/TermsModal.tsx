"use client";

/**
 * TermsModal — 用户协议与隐私政策弹窗
 *
 * 替换真实协议文本：修改下方 TERMS_PLACEHOLDER 常量即可。
 */

const TERMS_PLACEHOLDER = `叙境 Xujing 用户协议与隐私政策

一、服务说明
叙境（以下简称"本平台"）是一个 基于人工智能技术的虚拟聊天平台，提供虚拟角色聊天、角色创建与管理等服务。本软件仅供年满18周岁的成年用户用于个人娱乐、情感陪伴及日常交流。本软件不构成任何人际关系、医疗建议、心理咨询或法律服务的替代。

二、用户注册与账户安全
1. 用户在注册时应提供真实、准确的电子邮箱地址。
2. 用户应妥善保管账户密码，因密码泄露导致的损失由用户自行承担。
3. 每个邮箱地址仅允许注册一个账户。

三、用户行为规范
1. 用户不得利用本平台从事任何违法活动，包括但不限于：传播色情、淫秽、暴力、恐怖主义、赌博、毒品、诈骗等信息；侵犯他人知识产权、隐私权、名誉权等合法权益；干扰、破坏本软件的正常运行。
2. 用户不得上传、发布任何违法、淫秽、暴力、骚扰、诽谤或其他不当内容。
3. 用户不得对平台系统进行反向工程、破解、反编译、反汇编或试图提取源代码等任何形式的攻击。
4. 用户不得使用自动化工具（脚本、机器人等）批量注册账户或发送请求。
5.您不得诱导AI生成违反法律法规或社会主义核心价值观的内容。


四、星钻与虚拟资产
1. 星钻是本平台的虚拟资产，可用于解锁特定功能。
2. 星钻不可兑换为真实货币，不可转让，不可退款。
3. 平台保留对星钻获取与消耗规则进行调整的权利。

五、隐私政策
1. 本平台收集用户的邮箱地址用于账户识别与登录验证。
2. 您创建的角色和聊天记录优先存储在您的设备本地，如需要可将聊天记录存储于平台服务器，切换设备时同步角色与聊天记录，开发者无法查看、获取或使用您的聊天内容。
3. 本平台不会向第三方出售或分享用户的个人信息。
4. 用户有权随时请求删除其账户及所有关联数据。
5.您发送给AI的消息会通过加密网络传输至第三方AI服务商进行处理，请勿发送任何个人敏感信息(如身份证号、银行卡号、密码等)。

六、AI内容免责声明
1. 本软件所有AI生成的内容均由第三方AI大模型(包括但不限于OpenAI、Anthropic、Google Gemini等)自动生成，开发者不对AI生成内容的准确性、完整性、合法性、适切性作任何明示或默示的保证。
2. AI的回复不代表开发者的观点、立场或建议。用户应自行判断AI回复的合理性，并独立承担依据AI回复做出任何决定或行为所产生的全部后果。
3. 本软件已部署内容安全过滤机制，但由于AI技术本身的局限性，无法保证100%拦截所有不当内容。如您发现任何不当内容，请立即停止使用并联系开发者。

七、知识产权
本软件(包括但不限于代码、界面设计、图标、文案)的著作权及其他知识产权归开发者所有。未经开发者书面许可，任何人不得复制、修改、发布、出售本软件或其任何部分。用户通过本软件与AI互动所产生的对话内容，其权利归属遵循相关AI服务商的使用条款。

八、法律适用
本协议的订立、效力、解释、履行及争议解决均适用中华人民共和国法律。因本协议引起的或与本协议有关的任何争议，双方应首先友好协商解决；协商不成的，任何一方均有权向开发者所在地有管辖权的人民法院提起诉讼。

九、责任限制
在适用法律允许的最大范围内，开发者不对因使用或无法使用本软件而产生的任何直接、间接、附带、特殊、惩罚性或后果性损害(包括但不限于数据丢失、精神损害、经济损失等)承担责任，即使开发者已被告知此类损害的可能性。若您不同意上述责任限制，请勿使用本软件。

十、协议变更与终止
1.开发者保留随时修改本协议的权利，修改后的协议将在软件更新时生效。继续使用本软件即视为接受修改后的协议。
2.如您违反本协议任何条款，开发者有权立即终止您使用本软件的权利。
3.您可以随时卸载本软件以终止使用。

十一、特别声明
本软件为个人开发者的学习与分享项目。软件中所有虚拟角色的形象、性格、设定均为虚构，仅供娱乐，与现实人物、事件无任何关联。使用本软件即表示您已充分理解并同意：开发者对您使用本软件所产生的任何后果不承担任何责任。

如对本协议有任何疑问，请联系：zzx2975366562@gmail.com

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
