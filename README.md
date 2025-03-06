# Salesforce Deployment Suite for Visual Studio Code

This extension is designed to streamline the deployment process between Salesforce orgs (Scratch Orgs, Sandboxes, and Developer Edition (DE) Orgs). 
Developers and Admins can easily search, select, and deploy metadata components.

### <ins>Key Features</ins>

#### Metadata Management:

* Search & Select metadata components directly from authorized orgs.
* Advanced Filters — Filter components by Type, Name, Last Modified Date, and Last Modified By.
* Compare Components — Compare metadata between Source and Target orgs to identify differences before deployment.
* Caching Support — Cache component lists to reduce load times and avoid fetching data from the org on every request.
#### Component Handling:

* Snapshots — Save selected components as snapshots for future deployments.
* CSV Export — Export available or selected components to a CSV file.
* Bulk Selection — Quickly select components using the TYPE.NAME format.
#### Deployment Options:

* Package.xml Generation — Generate package.xml for use in tools like the ANT Migration Tool.
* Deploy/Validate — Deploy or validate components to/from different authorized orgs.
* Test Options — Choose from various test levels during deployment/validation.
#### Additional Features:

* View Test Class Failures — Display detailed test class failures, including error messages and stack traces.
* Track Deployment Failures — Get a clear view of failed deployments with reasons and failed components highlighted.
* Cancel Deployment — Ability to cancel ongoing deployments.
* Quick Deployment — Fast-track deployments that have been validated successfully.

 

### <ins>Workflow Guide</ins>

* **Setup SFDX Project in VS Code:** Install Salesforce CLI and VS Code, add the Salesforce Extension Pack, create a project using SFDX: Create Project With Manifest, and authorize at least two orgs using SFDX: Authorize an Org.
* Launch the Extension using SFDX Deployment: Select and Deploy metadata
  ![image](https://github.com/user-attachments/assets/d989f505-6352-4163-a50c-ce0f1be2f007)
* **Select Source Org:** Choose the source org from available authorized orgs.
  ![image](https://github.com/user-attachments/assets/c10caeef-08ff-4ac8-a3b0-855ac17e9cb7)
* **Load Components:** On org selection, the tool loads all available components. Components are loaded from cache if previously fetched to optimize performance.
  ![image](https://github.com/user-attachments/assets/6906bf94-21cb-49d3-aaff-ed2191387df5)
* **Filter Components:** Use the 'Type' dropdown to filter components by type (e.g., ApexClass, CustomField, LightningComponentBundle, etc.).
  ![image](https://github.com/user-attachments/assets/af08210a-94a3-4340-8a01-6bd61f2debf3)
* **Select Components:** Search and select components to be deployed.
  ![image](https://github.com/user-attachments/assets/87ab1b55-16d5-4c59-b440-cc1d77427c9d)
* **Bulk Selection:** Use the Bulk Selection button to select multiple components at once using the TYPE.NAME format.
  ![image](https://github.com/user-attachments/assets/4f48c5f4-bdde-4539-8f7a-9a3b2ab4d952)
* **Manage Selections:** Switch to the 'Selected' tab to review selected components.Uncheck any component to remove it from the selection.
  ![image](https://github.com/user-attachments/assets/81f89e62-b92e-46a6-b614-f9677339e557)
* **Generate Package.xml:** Click the 'Package.xml' button to generate the package.xml for deployment.
 ![image](https://github.com/user-attachments/assets/51da47bd-1e5f-4c45-83e0-2e0eff3913a6)
* **Export Components:** Use Export All or Export Selection buttons to save the list of components as a CSV file.
  ![image](https://github.com/user-attachments/assets/968e17ee-f57e-4d37-827b-566b9d92ee90)
* **Snapshots:** Save component selections as Snapshots for future deployments.
  ![image](https://github.com/user-attachments/assets/afea16f5-2d1a-40f3-aec2-3c02c1fd5239)
* **Select Destination Org:** Click 'Next' to move to the next screen and select the destination org for deployment.
  ![image](https://github.com/user-attachments/assets/8ab16855-13d9-4907-a3cd-751bfb02d2dc)
* **Test Options:** Use the 'Test Options' dropdown to select test levels (e.g., Run Local Tests, Run All Tests).
  ![image](https://github.com/user-attachments/assets/dc37a133-1df3-4f0c-a65b-3f8e58bd0f8e)
* **Compare Components:** Click the Compare button and Click "View" link of the each component to view differences between source and target org components.
  ![image](https://github.com/user-attachments/assets/432a9f0e-d6ff-4bcd-a53f-9e591adbd379)
* **Validate & Quick Deploy:** Use the Validate button to validate components against the target org. If validation passes, use Quick Deployment for immediate deployment.
  ![image](https://github.com/user-attachments/assets/93030545-20aa-48ad-bd4b-50d121e3a563)
  ![image](https://github.com/user-attachments/assets/f59fe18b-b246-4675-8f46-b2215de3ec8f)  
* **Deploy & Cancel:** Click the Deploy button to start the deployment. Use the Cancel link to abort an ongoing deployment.
  ![image](https://github.com/user-attachments/assets/55b0697d-23a3-40ed-8090-b61634a4d628)
  ![image](https://github.com/user-attachments/assets/63524fe3-d1d8-4b04-b058-a6d183e4f14f)
* **Review Failures & Coverage:** Use dedicated tabs to review Test Class Failures, Component Deployment Failures and Code Coverages.
  ![image](https://github.com/user-attachments/assets/7a850589-e807-4524-a72f-781cec62867d)
* **Report Issue:** Use "Help" link next to the title to report the issue.
  ![image](https://github.com/user-attachments/assets/a7661909-f7d9-4324-825f-0ec70adf0b8e)