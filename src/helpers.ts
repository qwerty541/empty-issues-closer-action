/**
 * @file Contains action helper functions.
 */
import {octokit} from './utils' // NOTE: Makes sure env variables are loaded first.

import {setFailed} from '@actions/core'
import {context} from '@actions/github'
import {RequestError} from '@octokit/request-error'
import {debug} from 'console'
import fs from 'fs/promises'
import {ISSUES_TEMPLATES_FOLDER} from './constants'

export type GithubContext = typeof context

// == Types ==

/**
 * Repository info.
 */
interface RepoInfo {
  owner: string
  repo: string
}

/**
 * Issues information object.
 */
export interface IssueInfo {
  number: number
  state: string
  body: string | null | undefined
}

// == Methods ==

/**
 * Convert a string to a boolean.
 */
export const str2bool = (str: string): boolean => {
  return str.toLowerCase() === 'true'
}

/**
 * Retrieve information about the repository that ran the action.
 * @param context Action context.
 * @returns Repository information.
 */
export const getRepoInfo = (ctx: GithubContext): RepoInfo => {
  try {
    return {
      owner: ctx.repo.owner,
      repo: ctx.repo.repo
    }
  } catch (error) {
    if (error instanceof RequestError) {
      setFailed(
        `Repository and user information could not be retrieved: ${error.message}`
      )
    }
    throw error
  }
}

/**
 * Fetch information about an issue from context.
 *
 * @param ctx Action context.
 * @returns Issue information.
 */
export const fetchIssueInfo = (ctx: GithubContext): IssueInfo | undefined => {
  if (!ctx.payload.issue) {
    setFailed('Issue number is missing')
    return
  } else {
    return {
      number: ctx.payload.issue.number,
      state: ctx.payload.issue.state,
      body: ctx.payload.issue.body
    }
  }
}

/**
 * Change the state of an issue.
 *
 * @param owner Repository owner.
 * @param repo Repository name.
 * @param issueNumber Issue number.
 * @param state Issue state.
 * @param comment Comment to add to the issue.
 */
export const changeIssueState = async (
  owner: string,
  repo: string,
  issueNumber: number,
  state: 'open' | 'closed' | undefined,
  comment: string
): Promise<void> => {
  if (comment && comment.length > 0) {
    debug(`Adding a comment to #${issueNumber}: ${comment}`)
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: comment
    })
  }

  debug(`Changing issue state of #${issueNumber} to ${state}`)
  await octokit.rest.issues.update({
    owner,
    repo,
    issue_number: issueNumber,
    state
  })
}

/**
 * Returns all template files in the templates folder.
 *
 * @returns Array of template files.
 */
export const retrieveTemplateFiles = async (): Promise<string[]> => {
  try {
    return await fs.readdir(`${ISSUES_TEMPLATES_FOLDER}`)
  } catch (error) {
    if (error instanceof Error && !(error.code === 'ENOENT')) {
      throw error
    }
    return []
  }
}

/**
 *  Retrieve all the bodies of the template files.
 *
 * @param templateFiles Template files.
 * @returns Template files bodies.
 */
export const retrieveTemplateBodies = async (
  templateFiles: string[]
): Promise<string[]> => {
  const templates: string[] = []
  for (const templateFile of templateFiles) {
    const templateString = await fs.readFile(
      `${ISSUES_TEMPLATES_FOLDER}/${templateFile}`,
      'utf-8'
    )
    templateString.replace(/---([\s\S]*?)---/gm, '') // Trim template header.
    templates.push(templateString)
  }
  return templates
}

/**
 * Check if the template has changed.
 *
 * @remark Regex used to make ignore empty lines.
 *
 * @param issueInfo Issue information object.
 * @param templateStrings Template strings.
 * @returns Boolean specifying if the template has changed.
 */
export const templateChanged = (
  issueInfo: IssueInfo,
  templateStrings: string[]
): boolean => {
  return templateStrings.some(templateString => {
    return (
      issueInfo.body?.replace(/\n/g, '') !== templateString.replace(/\n/g, '')
    )
  })
}
