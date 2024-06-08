import express from 'express';
import validator from 'validator';
import portfinder from 'portfinder';
import Redis from 'ioredis';
import 'dotenv/config';
import cors from 'cors';
import { exec } from 'child_process';
import { promisify } from 'util';

const app = express();
const redisClient = new Redis(process.env.REDIS_URL || '');
const execAsync = promisify(exec);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

portfinder.basePort = 3001;

const generateSlug = (githubUrl, projectPath) => {
  const parsedUrl = new URL(githubUrl);
  const pathname = parsedUrl.pathname;
  const slugBase = projectPath
    ? `${projectPath}-${pathname.split('/').slice(1, 3).join('-')}`
    : pathname.split('/').slice(1, 3).join('-');
  const cleanSlug = slugBase.replace(/[^a-zA-Z0-9-]/g, '');
  return cleanSlug.toLowerCase();
};

const deployApplication = async (
  githubUrl,
  envFile,
  slug,
  installCmd,
  buildCmd,
  runCmd,
  projectPath
) => {
  const availablePort = await portfinder.getPortPromise();

  const helmValues = `
    replicaCount=1
    image.repository=myregistry/clone-repo
    image.tag=latest
    image.pullPolicy=IfNotPresent
    githubUrl=${githubUrl}
    envFile=${envFile}
    installCmd=${installCmd}
    buildCmd=${buildCmd}
    runCmd=${runCmd}
    projectPath=${projectPath}
    service.type=ClusterIP
    service.port=${availablePort}
    ingress.enabled=true
    ingress.hosts[0].host=${slug}.hsingh.site
  `;

  const helmCommand = `helm install ${slug} ./myapp --set ${helmValues
    .split('\n')
    .join(' --set ')
    .trim()}`;

  try {
    const { stdout, stderr } = await execAsync(helmCommand);
    console.log(`Helm stdout: ${stdout}`);
    console.error(`Helm stderr: ${stderr}`);
    await redisClient.set(
      `logs:${slug}`,
      `Deployment started for ${slug}.hsingh.site\n`
    );
    return `https://${slug}.hsingh.site`;
  } catch (error) {
    console.error('Error during deployment:', error);
    await redisClient.set(`logs:${slug}`, `Error: ${error.message}\n`);
    throw error;
  }
};

app.post('/deploy', async (req, res) => {
  try {
    const { githubUrl, envFile, installCmd, buildCmd, runCmd, projectPath } =
      req.body;
    if (!githubUrl || !validator.isURL(githubUrl, { require_protocol: true })) {
      return res.status(400).send('A valid GitHub URL is required');
    }

    const slug = generateSlug(githubUrl, projectPath);
    const siteUrl = await deployApplication(
      githubUrl,
      envFile,
      slug,
      installCmd,
      buildCmd,
      runCmd,
      projectPath
    );

    res.send({
      message: 'Deployment started',
      siteUrl,
      logUrl: `/logs/${slug}`,
    });
  } catch (error) {
    console.error('ERROR:', error);
    res.status(500).send({ message: 'Deployment error', error: error.message });
  }
});

app.get('/logs/:slug', async (req, res) => {
  const { slug } = req.params;
  const logs = await redisClient.get(`logs:${slug}`);
  res.send({ logs: logs || 'No logs available yet.' });
});

app.post('/destroy/:slug', async (req, res) => {
  const { slug } = req.params;
  const helmCommand = `helm uninstall ${slug}`;
  try {
    const { stdout, stderr } = await execAsync(helmCommand);
    console.log(`Helm stdout: ${stdout}`);
    console.error(`Helm stderr: ${stderr}`);
    await redisClient.del(`logs:${slug}`);
    res.send({ message: `Deployment for ${slug} has been destroyed.` });
  } catch (error) {
    console.error('Error during destruction:', error);
    res
      .status(500)
      .send({ message: 'Error destroying deployment', error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
