import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { FaPlay, FaPlus, FaCode, FaTrash } from 'react-icons/fa';
import axios from 'axios';

const SUPPORTED_LANGUAGES = {
  'js': { name: 'javascript', label: 'JavaScript' },
  'py': { name: 'python', label: 'Python' },
  'html': { name: 'html', label: 'HTML' },
  'css': { name: 'css', label: 'CSS' },
  // Vain nämä kielet ovat tuettuja
};

const EXECUTABLE_EXTENSIONS = ['js', 'py']; // Vain nämä tiedostot voidaan suorittaa

function App() {
  const [projects, setProjects] = useState(() => {
    const savedProjects = localStorage.getItem('editorProjects');
    if (savedProjects) {
      return JSON.parse(savedProjects);
    }
    return {
      'Oletusprojekti': [
        {
          name: 'index.js',
          language: 'javascript',
          value: '// Tervetuloa Koodieditoriin!\nconsole.log("Hello World!");'
        },
        {
          name: 'styles.css',
          language: 'css',
          value: 'body {\n  background: #1a1a1a;\n  color: white;\n}'
        },
        {
          name: 'index.html',
          language: 'html',
          value: '<div>Hello World!</div>'
        },
        {
          name: 'example.py',
          language: 'python',
          value: '# Python esimerkki\n\ndef tervehdys(nimi):\n    return f"Hei {nimi}!"\n\nprint(tervehdys("Maailma"))'
        }
      ]
    };
  });

  const [currentProject, setCurrentProject] = useState(() => {
    const lastProject = localStorage.getItem('lastProject');
    return lastProject || 'Oletusprojekti';
  });

  const [files, setFiles] = useState(projects[currentProject]);

  useEffect(() => {
    const updatedProjects = { ...projects, [currentProject]: files };
    setProjects(updatedProjects);
    localStorage.setItem('editorProjects', JSON.stringify(updatedProjects));
    localStorage.setItem('lastProject', currentProject);
  }, [files, currentProject]);

  const [activeFile, setActiveFile] = useState(0);
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [analyzingCode, setAnalyzingCode] = useState(false);

  const handleEditorChange = (value) => {
    const updatedFiles = [...files];
    updatedFiles[activeFile].value = value;
    setFiles(updatedFiles);
  };

  const addNewFile = () => {
    const fileName = prompt('Anna tiedoston nimi (esim: test.js):');
    if (!fileName) return;

    const fileExtension = fileName.split('.').pop().toLowerCase();
    
    // Tarkista onko tiedostopääte tuettu
    if (!SUPPORTED_LANGUAGES[fileExtension]) {
      alert(`Tiedostotyyppi .${fileExtension} ei ole tuettu.\nTuetut tiedostotyypit: ${Object.keys(SUPPORTED_LANGUAGES).map(ext => '.' + ext).join(', ')}`);
      return;
    }

    // Tarkista onko samanniminen tiedosto jo olemassa
    if (files.some(f => f.name.toLowerCase() === fileName.toLowerCase())) {
      alert('Samanniminen tiedosto on jo olemassa!');
      return;
    }

    setFiles([...files, {
      name: fileName,
      language: SUPPORTED_LANGUAGES[fileExtension].name,
      value: ''
    }]);
  };

  const runCode = async () => {
    const currentFile = files[activeFile];
    const fileExtension = currentFile.name.split('.').pop().toLowerCase();

    // Tarkista voiko tiedostoa suorittaa
    if (!EXECUTABLE_EXTENSIONS.includes(fileExtension)) {
      setOutput(`Virhe: ${currentFile.name} tiedostoa ei voi suorittaa.\nVain JavaScript (.js) ja Python (.py) tiedostot ovat suoritettavissa.`);
      return;
    }

    try {
      setLoading(true);
      const response = await axios.post('http://localhost:3001/api/execute', {
        files: files
      });
      setOutput(response.data.output);
    } catch (error) {
      setOutput('Virhe: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const analyzeCode = async () => {
    const currentFile = files[activeFile];
    const fileExtension = currentFile.name.split('.').pop().toLowerCase();

    // Tarkista voiko tiedostoa analysoida
    if (!['js', 'py', 'html', 'css'].includes(fileExtension)) {
      setFeedback('Vain JavaScript, Python, HTML ja CSS tiedostoja voidaan analysoida.');
      return;
    }

    try {
      setAnalyzingCode(true);
      const response = await axios.post('http://localhost:3001/api/analyze', {
        files: [currentFile],
        language: fileExtension
      });
      setFeedback(response.data.feedback);
    } catch (error) {
      setFeedback('Virhe koodin analysoinnissa: ' + (error.response?.data?.error || error.message));
    } finally {
      setAnalyzingCode(false);
    }
  };

  const getPreview = () => {
    const htmlFile = files.find(f => f.name.endsWith('.html'))?.value || '';
    const allCssFiles = files
      .filter(f => f.name.endsWith('.css'))
      .map(f => f.value)
      .join('\n\n/* Seuraava CSS-tiedosto */\n');
    
    return `
      <html>
        <style>
          /* CSS Reset */
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          /* Kaikki CSS-tiedostot */
          ${allCssFiles}
        </style>
        <body>${htmlFile}</body>
      </html>
    `;
  };

  const showPreview = files[activeFile].name.endsWith('.html') || files[activeFile].name.endsWith('.css');

  const clearStorage = () => {
    if (confirm('Haluatko varmasti tyhjentää kaikki tallennetut tiedostot? Tätä toimintoa ei voi perua.')) {
      localStorage.removeItem('editorFiles');
      setFiles([
        {
          name: 'index.js',
          language: 'javascript',
          value: '// Tervetuloa Koodieditoriin!\nconsole.log("Hello World!");'
        },
        {
          name: 'styles.css',
          language: 'css',
          value: 'body {\n  background: #1a1a1a;\n  color: white;\n}'
        },
        {
          name: 'index.html',
          language: 'html',
          value: '<div>Hello World!</div>'
        },
        {
          name: 'example.py',
          language: 'python',
          value: '# Python esimerkki\n\ndef tervehdys(nimi):\n    return f"Hei {nimi}!"\n\nprint(tervehdys("Maailma"))'
        }
      ]);
      setActiveFile(0);
    }
  };

  const projectTemplates = {
    'web': {
      name: 'Web-projekti (HTML, CSS, JS)',
      files: [
        {
          name: 'index.html',
          language: 'html',
          value: '<!DOCTYPE html>\n<html>\n<head>\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n  <div class="container">\n    <h1>Tervetuloa!</h1>\n    <p>Muokkaa tiedostoja ja näe muutokset reaaliajassa.</p>\n  </div>\n  <script src="index.js"></script>\n</body>\n</html>'
        },
        {
          name: 'styles.css',
          language: 'css',
          value: '.container {\n  padding: 20px;\n  text-align: center;\n  font-family: Arial;\n}\n\nh1 {\n  color: #4a90e2;\n}\n'
        },
        {
          name: 'index.js',
          language: 'javascript',
          value: '// JavaScript koodi tähän\nconsole.log("Tervetuloa koodaamaan!");'
        }
      ]
    },
    'python': {
      name: 'Python-projekti',
      files: [
        {
          name: 'main.py',
          language: 'python',
          value: '# Python esimerkki\n\ndef fibonacci(n):\n    sequence = [0, 1]\n    for i in range(2, n):\n        sequence.append(sequence[i-1] + sequence[i-2])\n    return sequence\n\n# Generoi ja visualisoi Fibonacci-lukuja\nn = 10\nfib_numbers = fibonacci(n)\n\nprint("Fibonacci-lukujono:")\nfor i, num in enumerate(fib_numbers):\n    print(f"{i+1}: {num} {\'*\' * num}")'
        }
      ]
    }
  };

  const addNewProject = () => {
    const projectName = prompt('Anna projektin nimi:');
    if (!projectName) return;
    if (projects[projectName]) {
      alert('Projekti tällä nimellä on jo olemassa!');
      return;
    }

    const template = prompt(
      'Valitse projektin tyyppi (kirjoita numero):\n' +
      '1: Web-projekti (HTML, CSS, JS)\n' +
      '2: Python-projekti\n' +
      '3: Tyhjä projekti'
    );

    let newFiles;
    switch (template) {
      case '1':
        newFiles = projectTemplates.web.files;
        break;
      case '2':
        newFiles = projectTemplates.python.files;
        break;
      default:
        newFiles = [{
          name: 'index.js',
          language: 'javascript',
          value: '// Uusi projekti'
        }];
    }
    
    const newProjects = {
      ...projects,
      [projectName]: newFiles
    };
    setProjects(newProjects);
    setCurrentProject(projectName);
    setFiles(newFiles);
    setActiveFile(0);
  };

  const deleteProject = (projectName) => {
    if (Object.keys(projects).length === 1) {
      alert('Et voi poistaa viimeistä projektia!');
      return;
    }
    if (confirm(`Haluatko varmasti poistaa projektin "${projectName}"?`)) {
      const { [projectName]: removed, ...remainingProjects } = projects;
      setProjects(remainingProjects);
      const newCurrentProject = Object.keys(remainingProjects)[0];
      setCurrentProject(newCurrentProject);
      setFiles(remainingProjects[newCurrentProject]);
      setActiveFile(0);
    }
  };

  const deleteFile = (index) => {
    if (files.length <= 1) {
      alert('Et voi poistaa viimeistä tiedostoa!');
      return;
    }
    
    if (confirm('Haluatko varmasti poistaa tiedoston?')) {
      const newFiles = files.filter((_, i) => i !== index);
      setFiles(newFiles);
      if (activeFile >= newFiles.length) {
        setActiveFile(newFiles.length - 1);
      }
    }
  };

  const validateFileName = (name) => {
    if (!name) return false;
    // Tarkista että nimi sisältää vain sallittuja merkkejä
    const validNameRegex = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/;
    return validNameRegex.test(name);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
      <nav className="bg-gray-800 border-b border-gray-700 p-4 shadow-lg">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <FaCode className="text-blue-400 text-2xl" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text">
              Koodieditori Pro
            </h1>
            <div className="flex items-center gap-2">
              <select
                value={currentProject}
                onChange={(e) => {
                  setCurrentProject(e.target.value);
                  setFiles(projects[e.target.value]);
                  setActiveFile(0);
                  setFeedback('');
                }}
                className="bg-gray-700 text-white px-3 py-1 rounded-lg border border-gray-600"
              >
                {Object.keys(projects).map(projectName => (
                  <option key={projectName} value={projectName}>
                    {projectName}
                  </option>
                ))}
              </select>
              <button
                onClick={addNewProject}
                className="bg-green-600 hover:bg-green-700 p-1 rounded-lg"
                title="Uusi projekti"
              >
                <FaPlus className="text-white" />
              </button>
              {Object.keys(projects).length > 1 && (
                <button
                  onClick={() => deleteProject(currentProject)}
                  className="bg-red-600 hover:bg-red-700 p-1 rounded-lg"
                  title="Poista projekti"
                >
                  <FaTrash className="text-white" />
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={runCode}
              className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-all duration-200 shadow-lg hover:shadow-green-500/20"
              disabled={loading}
            >
              <FaPlay /> Suorita
            </button>
            <button
              onClick={analyzeCode}
              className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-all duration-200 shadow-lg hover:shadow-purple-500/20"
              disabled={analyzingCode}
            >
              <FaCode /> Analysoi koodi
            </button>
            <button
              onClick={clearStorage}
              className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-all duration-200 shadow-lg hover:shadow-red-500/20"
            >
              <FaTrash /> Tyhjennä tallennus
            </button>
          </div>
        </div>
      </nav>

      <div className="container mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 shadow-xl border border-gray-700">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-200">Tiedostot</h2>
                <button
                  onClick={addNewFile}
                  className="bg-gray-700 hover:bg-gray-600 p-2 rounded-lg transition-all duration-200"
                  title="Lisää uusi tiedosto"
                >
                  <FaPlus className="text-blue-400" />
                </button>
              </div>
              <div className="space-y-2">
                {files.map((file, index) => (
                  <div
                    key={file.name}
                    onClick={() => {
                      setActiveFile(index);
                      setFeedback('');
                    }}
                    className={`p-3 rounded-lg cursor-pointer transition-all duration-200 flex items-center justify-between group ${
                      activeFile === index 
                        ? 'bg-blue-600 shadow-lg shadow-blue-500/20' 
                        : 'hover:bg-gray-700'
                    }`}
                  >
                    <span>{file.name}</span>
                    {files.length > 1 && (
                      <FaTrash 
                        className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all duration-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteFile(index);
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="space-y-6">
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl shadow-xl border border-gray-700 overflow-hidden">
                <div className="bg-gray-800 p-2 border-b border-gray-700">
                  <span className="text-sm text-gray-400">{files[activeFile].name}</span>
                </div>
                <Editor
                  height="60vh"
                  language={files[activeFile].language}
                  theme="vs-dark"
                  value={files[activeFile].value}
                  onChange={handleEditorChange}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 16,
                    padding: { top: 16 },
                    scrollBeyondLastLine: false,
                    smoothScrolling: true,
                    cursorBlinking: "smooth",
                  }}
                  className="border-gray-700"
                />
              </div>

              {showPreview && (
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 shadow-xl border border-gray-700">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-200">Esikatselu</h2>
                  </div>
                  <div className="bg-white rounded-lg p-4 h-[600px] w-full overflow-hidden">
                    <iframe
                      srcDoc={getPreview()}
                      title="preview"
                      className="w-full h-full border-none"
                      style={{ 
                        background: 'white',
                        transform: 'scale(1)',
                        transformOrigin: 'top left',
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 shadow-xl border border-gray-700">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-gray-200">Konsoli</h2>
                  {output && (
                    <button
                      onClick={() => setOutput('')}
                      className="text-sm text-gray-400 hover:text-white transition-colors duration-200"
                    >
                      Tyhjennä
                    </button>
                  )}
                </div>
                <pre className="bg-gray-900/50 p-4 rounded-lg min-h-[150px] max-h-[200px] overflow-auto font-mono text-sm">
                  {loading ? (
                    <div className="flex items-center gap-2 text-gray-400">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Suoritetaan koodia...
                    </div>
                  ) : output || 'Konsoli on tyhjä. Suorita koodi nähdäksesi tulokset.'}
                </pre>
              </div>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 shadow-xl border border-gray-700 sticky top-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-200">Koodianalyysi</h2>
                {feedback && (
                  <button
                    onClick={() => setFeedback('')}
                    className="text-sm text-gray-400 hover:text-white transition-colors duration-200"
                  >
                    Tyhjennä
                  </button>
                )}
              </div>
              <div className="bg-gray-900/50 p-4 rounded-lg min-h-[200px]">
                {analyzingCode ? (
                  <div className="flex items-center gap-2 text-gray-400">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Analysoidaan koodia...
                  </div>
                ) : feedback ? (
                  <div className="whitespace-pre-line">{feedback}</div>
                ) : (
                  <div className="text-gray-400 text-center">
                    <FaCode className="mx-auto mb-2 text-2xl" />
                    Paina "Analysoi koodi" -nappia saadaksesi palautetta koodistasi
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
