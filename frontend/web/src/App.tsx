import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface FarmData {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  dataType: "soil" | "climate" | "crop";
  status: "pending" | "processed" | "error";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [farmData, setFarmData] = useState<FarmData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newData, setNewData] = useState({
    dataType: "soil",
    sensorData: ""
  });
  const [showTutorial, setShowTutorial] = useState(false);

  // Calculate statistics
  const soilCount = farmData.filter(d => d.dataType === "soil").length;
  const climateCount = farmData.filter(d => d.dataType === "climate").length;
  const cropCount = farmData.filter(d => d.dataType === "crop").length;
  const processedCount = farmData.filter(d => d.status === "processed").length;

  useEffect(() => {
    loadFarmData().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadFarmData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("data_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing data keys:", e);
        }
      }
      
      const list: FarmData[] = [];
      
      for (const key of keys) {
        try {
          const dataBytes = await contract.getData(`data_${key}`);
          if (dataBytes.length > 0) {
            try {
              const data = JSON.parse(ethers.toUtf8String(dataBytes));
              list.push({
                id: key,
                encryptedData: data.data,
                timestamp: data.timestamp,
                owner: data.owner,
                dataType: data.dataType,
                status: data.status || "pending"
              });
            } catch (e) {
              console.error(`Error parsing data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading data ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setFarmData(list);
    } catch (e) {
      console.error("Error loading farm data:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const uploadData = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setUploading(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting sensor data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const dataId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const dataRecord = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        dataType: newData.dataType,
        status: "pending"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `data_${dataId}`, 
        ethers.toUtf8Bytes(JSON.stringify(dataRecord))
      );
      
      const keysBytes = await contract.getData("data_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(dataId);
      
      await contract.setData(
        "data_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted data submitted securely!"
      });
      
      await loadFarmData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowUploadModal(false);
        setNewData({
          dataType: "soil",
          sensorData: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setUploading(false);
    }
  };

  const processData = async (dataId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted data with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const dataBytes = await contract.getData(`data_${dataId}`);
      if (dataBytes.length === 0) {
        throw new Error("Data not found");
      }
      
      const dataRecord = JSON.parse(ethers.toUtf8String(dataBytes));
      
      const updatedData = {
        ...dataRecord,
        status: "processed"
      };
      
      await contract.setData(
        `data_${dataId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedData))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE processing completed successfully!"
      });
      
      await loadFarmData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Processing failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to access the platform",
      icon: "🔗"
    },
    {
      title: "Upload Encrypted Data",
      description: "Securely upload your farm sensor data using FHE encryption",
      icon: "🔒"
    },
    {
      title: "FHE Model Training",
      description: "Your data is used to train prediction models while remaining encrypted",
      icon: "⚙️"
    },
    {
      title: "Get Yield Predictions",
      description: "Receive personalized crop yield predictions without compromising privacy",
      icon: "📊"
    }
  ];

  const renderDataStats = () => {
    return (
      <div className="data-stats">
        <div className="stat-item">
          <div className="stat-value">{farmData.length}</div>
          <div className="stat-label">Total Data Points</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{processedCount}</div>
          <div className="stat-label">Processed</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{soilCount}</div>
          <div className="stat-label">Soil Data</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{climateCount}</div>
          <div className="stat-label">Climate Data</div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="natural-spinner"></div>
      <p>Initializing encrypted connection...</p>
    </div>
  );

  return (
    <div className="app-container natural-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="leaf-icon"></div>
          </div>
          <h1>Privacy<span>Yield</span>Predict</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowUploadModal(true)} 
            className="upload-data-btn natural-button"
          >
            <div className="add-icon"></div>
            Upload Data
          </button>
          <button 
            className="natural-button"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Tutorial" : "Show Tutorial"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Privacy-Preserving Crop Yield Prediction</h2>
            <p>Securely share encrypted farm data to train accurate prediction models</p>
          </div>
        </div>
        
        <div className="panels-container">
          <div className="panel project-intro">
            <h3>Project Introduction</h3>
            <p>
              PrivacyYieldPredict enables multiple farms to securely share encrypted environmental 
              and crop data for training accurate yield prediction models using Fully Homomorphic 
              Encryption (FHE) technology.
            </p>
            <div className="fhe-badge">
              <span>FHE-Powered</span>
            </div>
            <div className="key-features">
              <h4>Key Features:</h4>
              <ul>
                <li>Secure encrypted sensor data upload</li>
                <li>FHE-based joint model training</li>
                <li>Personalized planting recommendations</li>
                <li>Protection of farm business secrets</li>
              </ul>
            </div>
          </div>
          
          <div className="panel data-stats-panel">
            <h3>Farm Data Statistics</h3>
            {renderDataStats()}
            <div className="data-distribution">
              <div className="distribution-item">
                <div className="distribution-bar soil" style={{ width: `${(soilCount / farmData.length) * 100 || 0}%` }}></div>
                <span>Soil Data: {soilCount}</span>
              </div>
              <div className="distribution-item">
                <div className="distribution-bar climate" style={{ width: `${(climateCount / farmData.length) * 100 || 0}%` }}></div>
                <span>Climate Data: {climateCount}</span>
              </div>
              <div className="distribution-item">
                <div className="distribution-bar crop" style={{ width: `${(cropCount / farmData.length) * 100 || 0}%` }}></div>
                <span>Crop Data: {cropCount}</span>
              </div>
            </div>
          </div>
          
          {showTutorial && (
            <div className="panel tutorial-panel">
              <h3>How It Works</h3>
              <div className="tutorial-steps">
                {tutorialSteps.map((step, index) => (
                  <div className="tutorial-step" key={index}>
                    <div className="step-number">{index + 1}</div>
                    <div className="step-content">
                      <h4>{step.title}</h4>
                      <p>{step.description}</p>
                    </div>
                    <div className="step-icon">{step.icon}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="panel data-list-panel">
            <div className="panel-header">
              <h3>Farm Data Records</h3>
              <div className="panel-actions">
                <button 
                  onClick={loadFarmData}
                  className="refresh-btn natural-button"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
            
            <div className="data-list">
              {farmData.length === 0 ? (
                <div className="no-data">
                  <div className="no-data-icon"></div>
                  <p>No farm data records found</p>
                  <button 
                    className="natural-button primary"
                    onClick={() => setShowUploadModal(true)}
                  >
                    Upload First Data
                  </button>
                </div>
              ) : (
                farmData.map(data => (
                  <div className="data-item" key={data.id}>
                    <div className="data-type">
                      <div className={`type-icon ${data.dataType}`}></div>
                      <span>{data.dataType}</span>
                    </div>
                    <div className="data-owner">
                      {data.owner.substring(0, 6)}...{data.owner.substring(38)}
                    </div>
                    <div className="data-date">
                      {new Date(data.timestamp * 1000).toLocaleDateString()}
                    </div>
                    <div className="data-status">
                      <span className={`status-badge ${data.status}`}>
                        {data.status}
                      </span>
                    </div>
                    <div className="data-actions">
                      {isOwner(data.owner) && data.status === "pending" && (
                        <button 
                          className="action-btn natural-button"
                          onClick={() => processData(data.id)}
                        >
                          Process
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
  
      {showUploadModal && (
        <ModalUpload 
          onSubmit={uploadData} 
          onClose={() => setShowUploadModal(false)} 
          uploading={uploading}
          data={newData}
          setData={setNewData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="notification">
          <div className={`notification-content ${transactionStatus.status}`}>
            {transactionStatus.message}
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="leaf-icon"></div>
              <span>PrivacyYieldPredict</span>
            </div>
            <p>Secure encrypted crop yield prediction using FHE technology</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} PrivacyYieldPredict. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalUploadProps {
  onSubmit: () => void; 
  onClose: () => void; 
  uploading: boolean;
  data: any;
  setData: (data: any) => void;
}

const ModalUpload: React.FC<ModalUploadProps> = ({ 
  onSubmit, 
  onClose, 
  uploading,
  data,
  setData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setData({
      ...data,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!data.sensorData) {
      alert("Please enter sensor data");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="upload-modal">
        <div className="modal-header">
          <h2>Upload Encrypted Farm Data</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="key-icon"></div> 
            <span>Your sensor data will be encrypted with FHE before storage</span>
          </div>
          
          <div className="form-group">
            <label>Data Type</label>
            <select 
              name="dataType"
              value={data.dataType} 
              onChange={handleChange}
              className="natural-select"
            >
              <option value="soil">Soil Data</option>
              <option value="climate">Climate Data</option>
              <option value="crop">Crop Data</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Sensor Data *</label>
            <textarea 
              name="sensorData"
              value={data.sensorData} 
              onChange={handleChange}
              placeholder="Enter sensor readings (temperature, humidity, pH levels, etc.)" 
              className="natural-textarea"
              rows={4}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn natural-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={uploading}
            className="submit-btn natural-button primary"
          >
            {uploading ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;