import * as core from '@actions/core'
import { context, getOctokit } from '@actions/github'
import { readFile } from 'fs/promises'

type Format = 'space-delimited' | 'csv' | 'json'
type FileStatus = 'added' | 'modified' | 'removed' | 'renamed'

async function run(): Promise<void> {
  try {
    // Create GitHub client with the API token.
    const client = getOctokit(core.getInput('token', { required: true }))
    const format = core.getInput('format', { required: true }) as Format

    // Ensure that the format parameter is set properly.
    if (format !== 'space-delimited' && format !== 'csv' && format !== 'json') {
      core.setFailed(`Format must be one of 'space-delimited', 'csv', or 'json', got '${format}'.`)
    }

    // Debug log the payload.
    core.debug(`Payload keys: ${Object.keys(context.payload)}`)

    // Get event name.
    const eventName = context.eventName

    // Define the base and head commits to be extracted from the payload.
    let base: string = context.payload.pull_request?.base?.sha ?? '';
    let head: string = context.payload.pull_request?.head?.sha ?? '';


    switch (eventName) {
      case 'pull_request':
        base = context.payload.pull_request?.base?.sha
        head = context.payload.pull_request?.head?.sha
        break
      case 'push':
        base = context.payload.before
        head = context.payload.after
        break
      default:
        core.setFailed(
          `This action only supports pull requests and pushes, ${context.eventName} events are not supported. ` +
            "Please submit an issue on this action's GitHub repo if you believe this is incorrect."
        )
    }

    // Log the base and head commits
    core.info(`Base commit: ${base}`)
    core.info(`Head commit: ${head}`)

    // Ensure that the base and head properties are set on the payload.
    if (!base || !head) {
      core.setFailed(
        `The base and head commits are missing from the payload for this ${context.eventName} event. ` +
          "Please submit an issue on this action's GitHub repo."
      )
    }

    // Exclude files logic
    const excludeFilePath = core.getInput('exclude-file', { required: false })
    const excludeFiles = new Set<string>()

    if (excludeFilePath) {
      try {
        const excludeFileContent = await readFile(excludeFilePath, 'utf8')
        excludeFileContent
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'))
          .forEach(line => excludeFiles.add(line))
      } catch (err) {
        core.warning(`Error reading exclude file: ${err}`)
      }
    }

    // Use GitHub's compare two commits API.
    const response = await client.rest.repos.compareCommits({
      base,
      head,
      owner: context.repo.owner,
      repo: context.repo.repo,
    })

    if (response.status !== 200) {
      core.setFailed(
        `The GitHub API for comparing the base and head commits for this ${context.eventName} event returned ${response.status}, expected 200.`
      )
    }

    const files = response.data.files || []
    const filteredFiles = files.filter(file => !excludeFiles.has(file.filename))

    if (filteredFiles.length === 0) {
      core.info("All files are excluded by the exclude file.")
      return
    }

    // Processing files logic here (similar to before)
    const all = filteredFiles.map(file => file.filename)

    core.setOutput('all', all.join(', '))

  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed(String(error))
    }
  }
}

run()
