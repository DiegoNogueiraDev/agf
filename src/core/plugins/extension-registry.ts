import type {
  ToolContributor,
  ContextContributor,
  ApprovalReviewContributor,
  TurnLifecycleContributor,
  ThreadLifecycleContributor,
  ConfigContributor,
  ToolLifecycleContributor,
  TurnInputContributor,
  TurnItemContributor,
  TokenUsageContributor,
} from '../../schemas/extension-lifecycle.schema.js'

export class ExtensionRegistryBuilder {
  private toolContributorsList: ToolContributor[] = []
  private contextContributorsList: ContextContributor[] = []
  private approvalReviewContributorsList: ApprovalReviewContributor[] = []
  private turnLifecycleContributorsList: TurnLifecycleContributor[] = []
  private threadLifecycleContributorsList: ThreadLifecycleContributor[] = []
  private configContributorsList: ConfigContributor[] = []
  private toolLifecycleContributorsList: ToolLifecycleContributor[] = []
  private turnInputContributorsList: TurnInputContributor[] = []
  private turnItemContributorsList: TurnItemContributor[] = []
  private tokenUsageContributorsList: TokenUsageContributor[] = []

  addToolContributor(c: ToolContributor): this {
    this.toolContributorsList.push(c)
    return this
  }

  addContextContributor(c: ContextContributor): this {
    this.contextContributorsList.push(c)
    return this
  }

  addApprovalReviewContributor(c: ApprovalReviewContributor): this {
    this.approvalReviewContributorsList.push(c)
    return this
  }

  addTurnLifecycleContributor(c: TurnLifecycleContributor): this {
    this.turnLifecycleContributorsList.push(c)
    return this
  }

  addThreadLifecycleContributor(c: ThreadLifecycleContributor): this {
    this.threadLifecycleContributorsList.push(c)
    return this
  }

  addConfigContributor(c: ConfigContributor): this {
    this.configContributorsList.push(c)
    return this
  }

  addToolLifecycleContributor(c: ToolLifecycleContributor): this {
    this.toolLifecycleContributorsList.push(c)
    return this
  }

  addTurnInputContributor(c: TurnInputContributor): this {
    this.turnInputContributorsList.push(c)
    return this
  }

  addTurnItemContributor(c: TurnItemContributor): this {
    this.turnItemContributorsList.push(c)
    return this
  }

  addTokenUsageContributor(c: TokenUsageContributor): this {
    this.tokenUsageContributorsList.push(c)
    return this
  }

  build(): ExtensionRegistry {
    const tools = Object.freeze([...this.toolContributorsList])
    const contexts = Object.freeze([...this.contextContributorsList])
    const approvals = Object.freeze([...this.approvalReviewContributorsList])
    const turns = Object.freeze([...this.turnLifecycleContributorsList])
    const threads = Object.freeze([...this.threadLifecycleContributorsList])
    const configs = Object.freeze([...this.configContributorsList])
    const toolLifecycles = Object.freeze([...this.toolLifecycleContributorsList])
    const turnInputs = Object.freeze([...this.turnInputContributorsList])
    const turnItems = Object.freeze([...this.turnItemContributorsList])
    const tokenUsages = Object.freeze([...this.tokenUsageContributorsList])

    return Object.freeze({
      toolContributors: () => tools,
      contextContributors: () => contexts,
      approvalReviewContributors: () => approvals,
      turnLifecycleContributors: () => turns,
      threadLifecycleContributors: () => threads,
      configContributors: () => configs,
      toolLifecycleContributors: () => toolLifecycles,
      turnInputContributors: () => turnInputs,
      turnItemContributors: () => turnItems,
      tokenUsageContributors: () => tokenUsages,
    }) as unknown as ExtensionRegistry
  }
}

export interface ExtensionRegistry {
  toolContributors(): readonly ToolContributor[]
  contextContributors(): readonly ContextContributor[]
  approvalReviewContributors(): readonly ApprovalReviewContributor[]
  turnLifecycleContributors(): readonly TurnLifecycleContributor[]
  threadLifecycleContributors(): readonly ThreadLifecycleContributor[]
  configContributors(): readonly ConfigContributor[]
  toolLifecycleContributors(): readonly ToolLifecycleContributor[]
  turnInputContributors(): readonly TurnInputContributor[]
  turnItemContributors(): readonly TurnItemContributor[]
  tokenUsageContributors(): readonly TokenUsageContributor[]
}
